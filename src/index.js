#! /usr/bin/env node
const debug = require('debug');
const { argv } = require('yargs');
const chalk = require('chalk');
const kebabCase = require('lodash.kebabcase');
const path = require('path');
const fs = require('fs');
const spawn = require('cross-spawn');
const shell = require('shelljs');
const validator = require('validator');

const hsUtilsDebug = debug('hsUtils');
const rootDir = path.resolve(__dirname);
const cwd = process.cwd();
const runOpts = argv.opt || 'compare';
const runPackage = argv.package;
const newName = argv.new;
const oldName = argv.old;

hsUtilsDebug.enabled = argv.debug;

hsUtilsDebug('rootDir for hsUtils\n', rootDir);
hsUtilsDebug('cwd\n', cwd);

const jsonValidator = jsonFile => validator.isJSON(jsonFile);

const findFile = (name, thisCWD = cwd) => {
  const filePath = path.resolve(thisCWD, name);
  hsUtilsDebug(chalk.bold('filePath', filePath));
  return filePath;
};

const jsonFileToObj = (fileName, theCWD) => {
  let jsonFileObj = {};
  try {
    const jsonFileString = fs.readFileSync(findFile(fileName, theCWD), 'utf8');
    if (jsonValidator(jsonFileString)) {
      jsonFileObj = JSON.parse(jsonFileString);
    } else {
      console.log(chalk.red(`${theCWD || ''}/${fileName} JSON invalid`));
      return process.exit(1);
    }
  } catch (err) {
    console.warn(chalk.red('jsonFileToObj err', err));
  }
  if (
    !jsonFileObj ||
    !jsonFileObj.version ||
    !jsonFileObj.name
  ) {
    hsUtilsDebug(chalk.bold('!jsonFileObj', jsonFileObj));
    // eslint-disable-next-line
    console.log(chalk.red(`${theCWD || ''}/${fileName} is invalid or missing config, check readme for more information`));
    return process.exit(1);
  }
  return jsonFileObj;
};

// This is the package.json file hsUtils is installed in
const pkgJson = jsonFileToObj('package.json');

// Reading the package.json file to get the projectDirs
const projectDirs = (pkgJson.hsUtils && pkgJson.hsUtils.projectDirs) ?
  pkgJson.hsUtils.projectDirs :
  cwd;
const compareTo = path.resolve(cwd, '../', (pkgJson.hsUtils && pkgJson.hsUtils.compareTo) ?
  pkgJson.hsUtils.compareTo :
  cwd);
hsUtilsDebug('compareTo', compareTo);

const projects = () => {
  if (Array.isArray(projectDirs)) {
    hsUtilsDebug('projectDirs is array', projectDirs);
    return projectDirs.map(dir => path.resolve(cwd, '../', dir));
  } else if (projectDirs.length) {
    hsUtilsDebug('projectDirs not array', projectDirs);
    return ([projectDirs]);
  }
  return [];
};

const spawnOutDateCheck = thisCWD => new Promise((resolve, reject) => {
  function onExit(code) {
    switch (code) {
      case 0:
        console.log(`Pass - No updates needed for "${thisCWD}"\n`);
        resolve();
        break;
      case 1: // eslint-disable-line
        console.warn(`Updates needed for "${thisCWD}"\n`);
        resolve();
        break;
      default:
        console.error(`Error running depCheck for "${thisCWD}"\n`);
        reject(thisCWD);
    }
  }

  console.log(`\nStarting depCheck for ${thisCWD}`);
  const child = spawn('npm', ['outdated'], {
    stdio: 'inherit',
    shell: true,
    cwd: thisCWD,
  });
  child.on('exit', onExit);
});

function outdatedDepsMulti(...args) {
  let directories = (args[0] !== undefined) ?
    args[0] :
    [process.cwd()];

  if (!Array.isArray(directories)) {
    directories = [directories];
  }
  let promise = Promise.resolve();
  directories.forEach((dir) => {
    promise = promise.then(() => spawnOutDateCheck(dir));
  });
  return promise;
}

// Most of this came from here.. https://github.com/dollarshaveclub/package-diff
// Who knew dollar shave club was on npm?
function readModules(location) {
  const table = {};

  // Resolve package dependencies
  if (location.indexOf('package.json') !== -1) {
    const data = fs.readFileSync(location.replace(':dev', ''), 'utf-8');
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      parsed = false;
    }
    if (!parsed) { return; }

    const depsKey = location.indexOf(':dev') !== -1 ? 'devDependencies' : 'dependencies';
    const deps = parsed[depsKey] ?
      parsed[depsKey] :
      (parsed.dependencies || parsed.devDependencies);

    Object.keys(deps).forEach((key) => {
      deps[key] = deps[key].replace(/\^|~/g, '');
    });
    // eslint-disable-next-line
    return {
      name: `${location} {${depsKey}}`,
      deps,
    };
  }

  fs.readdirSync(location)
    .filter(name => name !== '.bin')
    .map((name) => {
      const pkg = path.join(location, name, 'package.json');
      const exists = fs.existsSync(pkg);
      if (!exists) { return; }

      const data = fs.readFileSync(pkg, 'utf-8');
      let parsed;

      try { parsed = JSON.parse(data); } catch (e) { parsed = false; }
      if (!parsed) { return; }

      table[name] = parsed.version;
    });
  return {
    name: location,
    deps: table,
  };
}

const comparePair = (comparePath, projectPath) => {
  if (!projectPath || !comparePath) {
    console.error('A base and compare path must be provided');
    process.exit(1);
  }

  const project = readModules(projectPath);
  const compare = readModules(comparePath);

  console.log(chalk.bold(`\nDiffing Project \n${project.name}\nvs. CompareTo \n${compare.name}`));

  Object.keys(project.deps).forEach((projectKey) => {
    if (projectKey in compare.deps) {
      if (project.deps[projectKey] === compare.deps[projectKey]) {
        console.log(`${projectKey}@${project.deps[projectKey]} - matches CompareTo`);
      } else {
        console.log(chalk.red(`${projectKey}@${project.deps[projectKey]} - CHECK: this is the Project version`));
        console.log(chalk.green(`${projectKey}@${compare.deps[projectKey]} - CHECK: this is the CompareTo version`));
      }
    } else {
      console.log(chalk.red(`${projectKey}@${project.deps[projectKey]} - Does not exist in CompareTo`));
    }
  });
};

function compareDepsMulti(...args) {
  let directories = (args[0] !== undefined) ?
    args[0] :
    [process.cwd()];

  if (!Array.isArray(directories)) {
    directories = [directories];
  }
  const compareDir = compareTo ? `${compareTo}` : '';
  hsUtilsDebug('compareDepsMulti() compareDir', compareDir);
  let promise = Promise.resolve();
  projects().forEach((dir) => {
    if (compareDir !== dir) {
      hsUtilsDebug('compareDepsMulti() forEach dir', dir);
      promise = promise.then(() => comparePair(`${compareDir}/package.json:dev`, `${dir}/package.json:dev`));
      promise = promise.then(() => comparePair(`${compareDir}/package.json`, `${dir}/package.json`));
    }
    return null;
  });
  return promise;
}

// This script more or less from https://github.com/kentcdodds/testing-workshop
function installDepsMulti(...args) {
  let directories = (args[0] !== undefined) ?
    args[0] :
    [process.cwd()];

  if (!Array.isArray(directories)) {
    directories = [directories];
  }
  console.log('Installing dependencies via npm install');
  function spawnInstall(thisCWD) {
    return new Promise((resolve, reject) => {
      function onExit(code) {
        if (code === 0) {
          console.log(`Finished installing dependencies in \n "${cwd}"`);
          resolve();
        } else {
          console.error(`Error installing dependencies in \n "${cwd}"`);
          reject(cwd);
        }
      }

      if (thisCWD !== rootDir) {
        console.log(`Starting install in \n ${thisCWD}`);
        const child = spawn('npm', ['install'], {
          stdio: 'inherit',
          shell: true,
          cwd: thisCWD // eslint-disable-line
        });
        child.on('exit', onExit);
      } else {
        console.log(`Skipping root \n "${thisCWD}"`);
        resolve();
      }
    });
  }

  let promise = Promise.resolve();
  directories.forEach((dir) => {
    promise = promise.then(() => spawnInstall(dir));
  });
  return promise;
}

const cleanNodeMods = thisCWD => new Promise((resolve, reject) => {
  console.log(`\nStarting cleanNodeMods for ${thisCWD}`);
  const exitCode = shell.rm('-rf', `${thisCWD}/node_modules`).code;
  if (exitCode === 0) {
    resolve();
  } else {
    console.log(`Error deleting node_modules for ${thisCWD}`);
    reject();
  }
});

// removed node_modules folder from projects
function cleanNodeModMulti(...args) {
  let directories = (args[0] !== undefined) ?
    args[0] :
    [process.cwd()];

  if (!Array.isArray(directories)) {
    directories = [directories];
  }

  let promise = Promise.resolve();
  directories.forEach((dir) => {
    promise = promise.then(() => cleanNodeMods(dir));
  });
  return promise;
}

function packageRename(oName, nName) {
  if (!oName || !nName) {
    console.log(chalk.red('please enter --old and --new names'));
    return process.exit(1);
  }
  shell.sed('-i', oName, kebabCase(nName), `${cwd}/package.json`);
  console.log(chalk.green('Rename complete'));
  return process.exit();
}

function packageValidate() {
  if (jsonFileToObj('package.json')) {
    console.log(chalk.bold.green('package.json is valid'));
    process.exit();
  }
}

// --opt <keys>
const optChoice = {
  install: installDepsMulti,
  outdated: outdatedDepsMulti,
  compare: compareDepsMulti,
  clean: cleanNodeModMulti,
};

switch (runPackage) {
  case ('validate'):
    console.log(chalk.green('hs-util package validate'));
    packageValidate();
    break;
  case ('rename'):
    console.log(chalk.green(`hs-util rename from ${oldName} to ${newName}`));
    packageRename(oldName, newName);
    break;
  default:
    console.log(chalk.green(`hs-util option ${runOpts}`));
    optChoice[runOpts]([...projects()])
      .then(
        () => {
          console.log('Projects script done!');
        },
        () => {
          // ignore, other logging going on...
        },
      );
}

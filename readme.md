# hs-utils

Some utilities for managing npm packages.

## Usage

### Install

This should be a dev dependency

```npm i -D --save @hypersprite/hs-utils```

### Setup

Optional setup needed for `--opt` commands.

Add a section for `hsUtils` to the package.json file that contains.

`projectDirs` is an array of related project directories you want to work with.

`compareTo` is a usually a main or master project directory, will use installed directory if none is defined.

These are based on the location of the package.json file.

Example folder structure:
```bash
~/all-code $  tree -L 2
.
├── modules-code
│   ├── this-project
│   ├── project-one
│   └── project-two
├── main-project
└── project-three
```

The hsUtils of `this-project` package.json might look like this:

```json

"hsUtils": {
  "projectDirs": [
    "project-one",
    "project-two",
    "../project-three"
  ],
  "compareTo": "../main-project"
},
```

### Usage

Runs `npm install` on each projectDirs project

`hs-util  --opt install`

Remove node_modules folders from each projectDirs project.

`hs-util --opt clean`

Compares Prod and Dev dependencies based on the package.json file for each projectDir project to the compareTo project. The output will show you what is missing or different version than the `compareTo`.

`hs-util --opt compare`

Runs npm outdated on each projectDirs project. Same as running npm outdated in the projects directory.

`hs-util --opt outdated`


Validate package.json file for basic things.

`hs-util --package validate`

find/replace text in the package.json file

`hs-util --pacakge rename --old component-starter --new cool-component`

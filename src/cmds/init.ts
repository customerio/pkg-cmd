import Listr from "listr";
import fs from "fs/promises";
import inquirer from "inquirer";
import fetch from "node-fetch";
import parseGitConfig from "parse-git-config";
import { basename, join } from "path";
import spdxLicenseMap from "spdx-license-list";
import { execa } from "execa";

const spdxLicenseList = Object.keys(spdxLicenseMap);

const readmeFileNames = [
  "README.md",
  "README.txt",
  "README",
  "Readme.md",
  "Readme.txt",
  "Readme",
  "readme.md",
  "readme.txt",
  "readme",
];

const licenseFileNames = [
  "LICENSE",
  "LICENSE.txt",
  "LICENSE.md",
  "License",
  "License.txt",
  "License.md",
  "license",
  "license.txt",
  "license.md",
];

const codeOfConductFileNames = [
  "CODE_OF_CONDUCT.md",
  "CODE_OF_CONDUCT.txt",
  "CODE_OF_CONDUCT",
  "Code_Of_Conduct.md",
  "Code_Of_Conduct.txt",
  "Code_Of_Conduct",
  "code_of_conduct.md",
  "code_of_conduct.txt",
  "code_of_conduct",
];

const cwd = process.cwd();
async function maybeReadFile(path: string): Promise<string | null> {
  try {
    return await fs.readFile(join(cwd, path), "utf8");
  } catch {
    return null;
  }
}

async function maybeReadFiles(paths: string[]): Promise<
  Array<{
    path: string;
    content: string;
  }>
> {
  return (await Promise.all(paths.map(maybeReadFile)))
    .map((file, i) => {
      if (file) {
        return {
          path: paths[i],
          content: file,
        };
      }

      return null;
    })
    .filter((file) => file !== null) as Array<{
    path: string;
    content: string;
  }>;
}

export default async function action(options: { reinitialize: boolean }) {
  try {
    const currentFolderName = basename(cwd);
    let parsedPackageJson: Record<string, any>;
    const packageJson = await maybeReadFile("package.json");
    let parsedGoMod: ReturnType<typeof parseGoMod>;
    const goMod = await maybeReadFile("go.mod");
    const readmeFiles = await maybeReadFiles(readmeFileNames);
    const licenseFiles = await maybeReadFiles(licenseFileNames);
    const codeOfConductFiles = await maybeReadFiles(codeOfConductFileNames);
    const gitConfig = await parseGitConfig();
    let freshInitialization = true;
    const currentValues: {
      language?: "node" | "go";
      name?: string;
      description?: string;
      author?: string;
      license?: (typeof spdxLicenseList)[number];
      gitRemote?: string;
      hasGit?: boolean;
    } = {
      gitRemote: gitConfig?.remote?.origin?.url,
      hasGit: !!gitConfig,
    };
    const newValues: {
      language?: "node" | "go";
      name?: string;
      description?: string;
      author?: string;
      license?: (typeof spdxLicenseList)[number];
      initializeGit?: boolean;
      gitRemote?: string;
      addPreCommitLinting?: boolean;
      addCodeOfConduct?: boolean;
      addReadme?: boolean;
    } = {};

    /**
     * We can have either a package.json or a go.mod file, but not both.
     */
    if (packageJson && goMod) {
      throw new Error(
        "You have both a package.json and a go.mod file. We don't know what to do. Exiting"
      );
    }

    /**
     * Grab the details from the package.json file
     */
    if (packageJson) {
      try {
        parsedPackageJson = JSON.parse(packageJson.toString());
      } catch (e) {
        throw new Error("Your package.json file is invalid. Exiting");
      }

      currentValues.language = "node";
      currentValues.name = parsedPackageJson.name;
      currentValues.description = parsedPackageJson.description;
      currentValues.author = parsedPackageJson.author;
      currentValues.license = parsedPackageJson.license;
    }

    /**
     * Grab the details from the go.mod file
     */
    if (goMod) {
      currentValues.language = "go";
      parsedGoMod = parseGoMod(goMod);
      currentValues.name = parsedGoMod!.module;
    }

    /**
     * require reinitialize flag if we have a package.json or go.mod file
     */
    if ((packageJson || goMod) && !options.reinitialize) {
      const answers = await inquirer.prompt([
        {
          type: "confirm",
          name: "reinitialize",
          message: `Looks like this project is already initialized.\n\n We will update the ${
            packageJson ? "package.json" : "go.mod"
          } with any new details and overwrite your license file and code of conduct.\n\n Do you want to continue?`,
          default: false,
        },
      ]);

      if (!answers.reinitialize) {
        process.exit(0);
      }

      freshInitialization = false;
    }

    /**
     * If we have a go project without git, throw an error
     */
    if (goMod && !gitConfig) {
      throw new Error(
        "You have a go.mod file but no git repo. We don't know what to do. Exiting"
      );
    }

    /**
     * Here we start gathering details
     *
     * By the end we'll know:
     * - language
     * - whether we want to initialize a git repo
     * - the git remote
     * - the name of the project
     * - the description of the project
     * - the author of the project
     * - the license of the project
     * - whether we want to add a code of conduct
     * - whether we want to add a readme
     */

    /**
     * Ask for the language if we don't have a package.json or go.mod file
     */
    if (!packageJson && !goMod) {
      // ask what language we're using
      const answers = await inquirer.prompt([
        {
          type: "list",
          name: "language",
          message: "What language are you using?",
          choices: ["Node", "Go"],
        },
      ]);

      newValues.language = answers.language.toLowerCase() as "node" | "go";
    }

    const language = (newValues.language || currentValues.language)!;

    if (!currentValues.hasGit) {
      const answers = await inquirer.prompt([
        // do you want to initialize a git repo?
        {
          type: "confirm",
          name: "initializeGit",
          message: "Do you want to initialize a git repo?",
        },
      ]);
      newValues.initializeGit = answers.initializeGit;

      if (
        freshInitialization &&
        !newValues.initializeGit &&
        newValues.language === "go"
      ) {
        throw new Error("You need to initialize a git repo to use Go. Exiting");
      }
    }

    if (newValues.initializeGit || !currentValues.gitRemote) {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "gitRemote",
          message: "What is the git remote URL?",
        },
      ]);

      newValues.gitRemote = answers.gitRemote;
    }

    if (newValues.initializeGit && language === "node") {
      const answers = await inquirer.prompt([
        {
          type: "confirm",
          name: "addPreCommitLinting",
          message:
            "Do you want to automatically lint your files before every commit?",
          default: true,
        },
      ]);

      newValues.addPreCommitLinting = answers.addPreCommitLinting;
    }

    {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "name",
          message: "What is the name of your project?",
          default: currentValues?.name || currentFolderName,
        },
      ]);

      newValues.name = answers.name;
    }

    {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "description",
          message: "What is the description of your project?",
          default: currentValues?.description,
        },
      ]);

      newValues.description = answers.description;
    }

    {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "author",
          message: "What is the author of your project?",
          default: currentValues?.author,
        },
      ]);

      newValues.author = answers.author;
    }

    {
      const answers = await inquirer.prompt([
        {
          type: "list",
          name: "license",
          message: "What license are you using?",
          choices: spdxLicenseList,
          default: currentValues?.license || "MIT",
        },
      ]);

      newValues.license = answers.license as (typeof spdxLicenseList)[number];
    }

    {
      const answers = await inquirer.prompt([
        {
          type: "confirm",
          name: "addCodeOfConduct",
          message: `Do you want to ${
            codeOfConductFiles.length > 0 ? "replace" : "add"
          } the Contributor Covenant Code of Conduct?`,
          default: codeOfConductFiles.length === 0,
        },
      ]);

      newValues.addCodeOfConduct = answers.addCodeOfConduct;
    }

    {
      const answers = await inquirer.prompt([
        {
          type: "confirm",
          name: "addReadme",
          message: `Do you want to ${
            readmeFiles.length > 0 ? "replace" : "add"
          } the README.md file?`,
          default: readmeFiles.length === 0,
        },
      ]);

      newValues.addReadme = answers.addReadme;
    }

    /**
     * Now we have all the details, we can start creating the files
     */
    const tasks: Listr.ListrTask<any>[] = [];

    /**
     * Git set up
     */
    if (newValues.initializeGit) {
      tasks.push({
        title: "Git",
        task: () => {
          return new Listr(
            compact<Listr.ListrTask>([
              {
                title: "Initialize git repository",
                task: async () => await execa("git", ["init"]),
              },
              {
                title: "Create .gitignore",
                task: async () => {
                  // fetch the .gitignore file from the template
                  const contents = await (
                    await fetch(
                      `https://raw.githubusercontent.com/github/gitignore/main/${
                        language === "node" ? "Node.gitignore" : "Go.gitignore"
                      }`
                    )
                  ).text();
                  await fs.writeFile(join(cwd, ".gitignore"), contents);
                },
              },
              newValues.gitRemote
                ? {
                    title: "Add git remote",
                    task: async () =>
                      await execa("git", [
                        "remote",
                        "add",
                        "origin",
                        newValues.gitRemote!,
                      ]),
                  }
                : null,
            ])
          );
        },
      });
    }

    /**
     * License
     */
    if (
      newValues.license &&
      // contains newValues.license.toLowerCase() with some whitespace
      !new RegExp(`\(\s|^)${newValues.license}\(\s|$)`, "i").test(
        licenseFiles?.[0]?.content ?? ""
      )
    ) {
      tasks.push({
        title: "License",
        task: async () => {
          return new Listr(
            compact<Listr.ListrTask>([
              licenseFiles.length > 0
                ? {
                    title: `Clean up previous LICENSE file`,
                    task: async () => {
                      for (const licenseFile of licenseFiles) {
                        try {
                          await fs.unlink(join(cwd, licenseFile.path));
                        } catch {
                          // ignore errors
                        }
                      }
                    },
                  }
                : null,
              {
                title: `Create ${
                  licenseFiles.length > 0 ? "new " : ""
                } LICENSE file`,
                task: async () => {
                  const text =
                    require(`spdx-license-list/licenses/${newValues.license}`).licenseText;
                  await fs.writeFile(
                    join(cwd, "LICENSE"),
                    text
                      .replace(
                        /(\<yyyy, yyyy\>|\<year\>|\<yyyy\>)/gi,
                        new Date().getFullYear().toString()
                      )
                      .replace(
                        /(\<author\>|\<name of author\>|\<owner organization name\>|\<name of development group\>|\<name of institution\>|\<organization\>|\<owner\>|\<copyright holders\>|\<holders\>|\<copyright holder\>|\<author's name or designee\>)/gi,
                        newValues.author
                      )
                      .replace(
                        /(\<insert your license name here\>)/gi,
                        newValues.license
                      )
                      .replace(/(\<program\>|\<product\>)/gi, newValues.name)
                  );
                },
              },
            ])
          );
        },
      });
    }

    /**
     * Code of Conduct
     */
    if (newValues.addCodeOfConduct) {
      tasks.push({
        title: "Code of Conduct",
        task: async () => {
          return new Listr(
            compact<Listr.ListrTask>([
              codeOfConductFiles.length > 0
                ? {
                    title: `Clean up previous CODE_OF_CONDUCT.md file`,
                    task: async () => {
                      for (const codeOfConductFile of codeOfConductFiles) {
                        try {
                          await fs.unlink(join(cwd, codeOfConductFile.path));
                        } catch {
                          // ignore errors
                        }
                      }
                    },
                  }
                : null,
              {
                title: `Create ${
                  codeOfConductFiles.length > 0 ? "new " : ""
                } CODE_OF_CONDUCT.md file`,
                task: async () => {
                  const contents = await (
                    await fetch(
                      "https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md"
                    )
                  ).text();

                  await fs.writeFile(join(cwd, "CODE_OF_CONDUCT.md"), contents);
                },
              },
            ])
          );
        },
      });
    }

    /**
     * Node
     */
    if (language === "node") {
      const packageJson = parsedPackageJson! || {};

      tasks.push({
        title: "package.json",
        task: async () => {
          return new Listr(
            compact<Listr.ListrTask>([
              /**
               * Create package.json if it doesn't exist
               */
              !parsedPackageJson!
                ? {
                    title: "Create package.json file",
                    task: async () => {
                      await fs.writeFile(
                        join(cwd, "package.json"),
                        JSON.stringify(
                          {
                            name: newValues.name,
                          },
                          null,
                          2
                        )
                      );
                    },
                  }
                : null,

              /**
               * Update package.json name if it changed
               */
              newValues.name && newValues.name !== currentValues?.name
                ? {
                    title: "Update package.json name",
                    task: async () =>
                      await execa("npm", [
                        "pkg",
                        "set",
                        "name=" + newValues.name,
                      ]),
                  }
                : null,

              /**
               * Update package.json description if it changed
               */
              newValues.description &&
              newValues.description !== currentValues?.description
                ? {
                    title: "Update package.json description",
                    task: async () =>
                      await execa("npm", [
                        "pkg",
                        "set",
                        "description=" + newValues.description,
                      ]),
                  }
                : null,

              /**
               * Update package.json author if it changed
               */
              newValues.author && newValues.author !== currentValues?.author
                ? {
                    title: "Update package.json author",
                    task: async () =>
                      await execa("npm", [
                        "pkg",
                        "set",
                        "author=" + newValues.author,
                      ]),
                  }
                : null,

              /**
               * Update package.json license if it changed
               */
              newValues.license && newValues.license !== currentValues?.license
                ? {
                    title: "Update package.json license",
                    task: async () =>
                      await execa("npm", [
                        "pkg",
                        "set",
                        "license=" + newValues.license,
                      ]),
                  }
                : null,

              /**
               * Update package.json repository
               */
              newValues.gitRemote &&
              newValues.gitRemote !== currentValues?.gitRemote
                ? {
                    title: "Update package.json repository",
                    task: async () => {
                      await execa("npm", ["pkg", "set", "repository.type=git"]);
                      await execa("npm", [
                        "pkg",
                        "set",
                        "repository.url=" + newValues.gitRemote,
                      ]);
                    },
                  }
                : null,

              /**
               * Install pkg-cmd if it's not installed
               */
              // !packageJson?.devDependencies?.["pkg-cmd"] &&
              // !packageJson?.dependencies?.["pkg-cmd"]
              //   ? {
              //       title: "Install pkg-cmd",
              //       task: () =>
              //         execa("npm", ["install", "pkg-cmd", "--save-dev"]),
              //     }
              //   : null,

              /**
               * Set the build script
               */
              // !packageJson?.scripts?.build
              //   ? {
              //       title: "Set build script",
              //       task: async () =>
              //         await execa("npm", [
              //           "pkg",
              //           "set",
              //           "scripts.build=pkg-cmd build",
              //         ]),
              //     }
              //   : null,

              /**
               * Set the exec script
               */
              // !packageJson?.scripts?.exec
              //   ? {
              //       title: "Set exec script",
              //       task: async () =>
              //         await execa("npm", [
              //           "pkg",
              //           "set",
              //           "scripts.exec=pkg-cmd exec",
              //         ]),
              //     }
              //   : null,

              /**
               * Set the lint script
               */
              !packageJson?.scripts?.lint
                ? {
                    title: "Set lint script",
                    task: async () =>
                      await execa("npm", [
                        "pkg",
                        "set",
                        "scripts.lint=pkg-cmd lint",
                      ]),
                  }
                : null,

              /**
               * Set the test script
               */
              !packageJson?.scripts?.test
                ? {
                    title: "Set test script",
                    task: async () =>
                      await execa("npm", [
                        "pkg",
                        "set",
                        "scripts.test=pkg-cmd test",
                      ]),
                  }
                : null,

              /**
               * Set the format script
               */
              !packageJson?.scripts?.format
                ? {
                    title: "Set format script",
                    task: async () =>
                      await execa("npm", [
                        "pkg",
                        "set",
                        "scripts.format=pkg-cmd format .",
                      ]),
                  }
                : null,

              /**
               * Set the release script
               */
              !packageJson?.scripts?.release
                ? {
                    title: "Set release script",
                    task: async () =>
                      await execa("npm", [
                        "pkg",
                        "set",
                        "scripts.release=pkg-cmd release",
                      ]),
                  }
                : null,
            ])
          );
        },
      });

      // todo: make this on a per tool basis
      if (freshInitialization) {
        tasks.push({
          title: "Tooling",
          task: async () => {
            return new Listr([
              {
                title: "Configure eslint",
                task: async () => {
                  await fs.writeFile(
                    join(cwd, ".eslintrc.js"),
                    `module.exports = {
              extends: [ require.resolve("pkg-cmd/eslint-config") ]
            };`
                  );
                },
              },
              {
                title: "Configure prettier",
                task: async () => {
                  await fs.writeFile(
                    join(cwd, ".prettierrc.js"),
                    `module.exports = { ...require("pkg-cmd/prettier-config"), }`
                  );
                },
              },
              {
                title: "Configure jest",
                task: async () => {
                  await fs.writeFile(
                    join(cwd, "jest.config.js"),
                    `module.exports = {
            ...require("pkg-cmd/jest-config"),
          };`
                  );
                },
              },
              {
                title: "Configuring np",
                task: async () => {
                  await fs.writeFile(
                    join(cwd, ".np-config.js"),
                    `module.exports = {
            ...require("pkg-cmd/np-config"),
          };`
                  );
                },
              },
            ]);
          },
        });
      }

      if (newValues.addPreCommitLinting) {
        tasks.push({
          title: "Pre-commit linting",
          task: async () => {
            return new Listr(
              compact<Listr.ListrTask>([
                {
                  title: "Install dependencies",
                  task: async () => {
                    await execa("npx", ["husky", "install"]);

                    await execa("npm", [
                      "pkg",
                      "set",
                      "scripts.prepare=husky install",
                    ]);

                    await execa("npx", [
                      "husky",
                      "add",
                      ".husky/pre-commit",
                      "npx lint-staged",
                    ]);
                  },
                },

                // todo: check if lint-staged is already configured
                {
                  title: "Configure lint-staged",
                  task: async () => {
                    await fs.writeFile(
                      join(cwd, ".lintstagedrc.js"),
                      `module.exports = {
      "*.{js,jsx,ts,tsx}": ["pkg-cmd format", "pkg-cmd lint"],
      "*.{css,less,scss,md,html,htm,json,yml,yaml,mdx}": ["pkg-cmd format"],
    };`
                    );
                  },
                },
              ])
            );
          },
        });
      }
    }

    /**
     * Go
     */
    if (language === "go" && freshInitialization && newValues.gitRemote) {
      tasks.push({
        title: "Initialize go module",
        task: async () => {
          const packageName = newValues.gitRemote!.replace(/^[^:]+:\/\//, "");
          await execa("go", ["mod", "init", packageName]);
        },
      });
    }

    /**
     * README
     */
    if (newValues.addReadme) {
      tasks.push({
        title: "README",
        task: async () => {
          return new Listr(
            compact<Listr.ListrTask>([
              readmeFiles.length > 0
                ? {
                    title: `Clean up current README`,
                    task: async () => {
                      for (const readmeFile of readmeFiles) {
                        try {
                          await fs.unlink(join(cwd, readmeFile.path));
                        } catch {
                          // ignore errors
                        }
                      }
                    },
                  }
                : null,

              /**
               * Generate a new README
               */
              {
                title: `Create ${
                  readmeFiles.length > 0 ? "new" : ""
                } README file`,
                task: async () => {
                  const contents =
                    language === "go"
                      ? generateGoReadme({
                          name: newValues.name ?? currentValues?.name ?? "",
                          description:
                            newValues.description ??
                            currentValues?.description ??
                            "",
                          badges: [],
                          licenseName:
                            spdxLicenseMap[newValues.license ?? ""]?.name ?? "",
                        })
                      : generateNodeReadme({
                          name: newValues.name ?? currentValues?.name ?? "",
                          description:
                            newValues.description ??
                            currentValues?.description ??
                            "",
                          badges: [],
                          licenseName:
                            spdxLicenseMap[newValues.license ?? ""]?.name ?? "",
                        });

                  await fs.writeFile(join(cwd, "README.md"), contents);
                },
              },
            ])
          );
        },
      });
    }

    const listr = new Listr(tasks);

    await listr.run();

    console.log("Set up complete!");
    return true;
  } catch (err) {
    console.log("Uncaught Error:");
    console.error(err);
    process.exit(1);
    return false;
  }
}

function parseGoMod(goMod: string) {
  const parsed = goMod.split("\n").reduce<{
    module: string;
    go: string;
  }>(
    (acc, line) => {
      if (line.startsWith("module ")) {
        acc.module = line.replace("module ", "");
      } else if (line.startsWith("go ")) {
        acc.go = line.replace("go ", "");
      }

      return acc;
    },
    { module: "", go: "" }
  );

  return parsed;
}

function generateGoReadme({
  name,
  description,
  badges,
  licenseName,
}: {
  name: string;
  description: string;
  badges: string[];
  licenseName: string;
}) {
  return `# ${name}

> ${description}

## Install

To install ${name}, run:

\`\`\`sh
go get ${name}
\`\`\`

${badges.join("\n")}

## Usage

\`\`\`go
\`\`\`

## API

---

## License

Released under the ${licenseName}. See file [LICENSE](./LICENSE) for more details.
`;
}

function generateNodeReadme({
  name,
  description,
  badges,
  licenseName,
}: {
  name: string;
  description: string;
  badges: string[];
  licenseName: string;
}) {
  return `# ${name}

> ${description}

## Install

To install ${name}, run:

\`\`\`sh
npm install ${name}
\`\`\`

${badges.join("\n")}

## Usage

\`\`\`js
import ${name} from '${name}';
\`\`\`

## API


---

## License

Released under the ${licenseName}. See file [LICENSE](./LICENSE) for more details.
`;
}

function compact<T>(array: (T | undefined | null)[]): T[] {
  return array.filter((item) => item) as T[];
}

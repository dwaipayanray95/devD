import fs from 'fs';
import path from 'path';

/**
 * Scans the current working directory to identify the project framework and resolve its run/build commands.
 * @param {string} cwd - The current directory path.
 * @returns {{ platformName: string, runCommand: string, runArgs: string[], buildCommand: string, buildArgs: string[] }|null}
 */
export function detectPlatform(cwd = process.cwd()) {
  // 1. Flutter
  if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) {
    return {
      platformName: 'Flutter',
      runCommand: 'flutter',
      runArgs: ['run'],
      buildCommand: 'flutter',
      buildArgs: ['build']
    };
  }

  // 2. Tauri (check src-tauri folder)
  if (fs.existsSync(path.join(cwd, 'src-tauri'))) {
    return {
      platformName: 'Tauri',
      runCommand: 'npm',
      runArgs: ['run', 'tauri', 'dev'],
      buildCommand: 'npm',
      buildArgs: ['run', 'tauri', 'build']
    };
  }

  // 3. Node.js/NPM
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    // Check if there is a dev script or start script
    let runArgs = ['run', 'dev'];
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      if (pkg.scripts) {
        if (pkg.scripts.dev) {
          runArgs = ['run', 'dev'];
        } else if (pkg.scripts.start) {
          runArgs = ['start'];
        }
      }
    } catch (e) {
      // Ignore JSON parse error, fallback to npm run dev
    }

    return {
      platformName: 'Node.js/NPM',
      runCommand: 'npm',
      runArgs: runArgs,
      buildCommand: 'npm',
      buildArgs: ['run', 'build']
    };
  }

  // 4. Cargo / Rust
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    return {
      platformName: 'Cargo/Rust',
      runCommand: 'cargo',
      runArgs: ['run'],
      buildCommand: 'cargo',
      buildArgs: ['build', '--release']
    };
  }

  // 5. Gradle / Java
  if (fs.existsSync(path.join(cwd, 'build.gradle'))) {
    const hasWrapper = fs.existsSync(path.join(cwd, 'gradlew'));
    const gradleCmd = hasWrapper ? './gradlew' : 'gradle';
    return {
      platformName: `Gradle/Java (${hasWrapper ? 'using gradlew' : 'using system gradle'})`,
      runCommand: gradleCmd,
      runArgs: ['run'],
      buildCommand: gradleCmd,
      buildArgs: ['build']
    };
  }

  // 6. Go
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    return {
      platformName: 'Go',
      runCommand: 'go',
      runArgs: ['run', '.'],
      buildCommand: 'go',
      buildArgs: ['build']
    };
  }

  // 7. Python
  if (
    fs.existsSync(path.join(cwd, 'requirements.txt')) ||
    fs.existsSync(path.join(cwd, 'Pipfile')) ||
    fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
    fs.existsSync(path.join(cwd, 'main.py'))
  ) {
    const runFile = fs.existsSync(path.join(cwd, 'main.py')) ? 'main.py' : 'app.py';
    return {
      platformName: 'Python',
      runCommand: 'python3',
      runArgs: [runFile],
      buildCommand: 'python3', // No native build command, just report syntax check or package step
      buildArgs: ['-m', 'py_compile', runFile]
    };
  }

  return null;
}

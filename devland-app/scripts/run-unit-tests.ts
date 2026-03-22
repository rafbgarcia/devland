import { readdir } from 'node:fs/promises';
import path from 'node:path';

async function findUnitTestFiles(directoryPath: string): Promise<string[]> {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  const childPaths = directoryEntries
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));
  const testFilePaths: string[] = [];

  for (const directoryEntry of childPaths) {
    const entryPath = path.join(directoryPath, directoryEntry.name);

    if (directoryEntry.isDirectory()) {
      testFilePaths.push(...await findUnitTestFiles(entryPath));
      continue;
    }

    if (!directoryEntry.isFile() || !/\.test\.tsx?$/.test(directoryEntry.name)) {
      continue;
    }

    testFilePaths.push(entryPath);
  }

  return testFilePaths;
}

const cwd = process.cwd();
const testFilePaths = (await findUnitTestFiles(path.join(cwd, 'src')))
  .map((filePath) => path.relative(cwd, filePath).split(path.sep).join(path.posix.sep));

if (testFilePaths.length === 0) {
  console.error('No unit test files were found under src.');
  process.exit(1);
}

let failedFileCount = 0;

for (const testFilePath of testFilePaths) {
  const testProcess = Bun.spawn(
    [process.execPath, 'test', testFilePath],
    {
      cwd,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  const exitCode = await testProcess.exited;

  if (exitCode !== 0) {
    failedFileCount += 1;
  }
}

if (failedFileCount > 0) {
  console.error(
    `\n${failedFileCount} unit test file${failedFileCount === 1 ? '' : 's'} failed.`,
  );
  process.exit(1);
}

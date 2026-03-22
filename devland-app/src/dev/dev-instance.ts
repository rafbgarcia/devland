import { createHash } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const DEV_PORT_MIN = 5000;
const DEV_PORT_MAX = 6000;
const DEV_PORT_SPAN = DEV_PORT_MAX - DEV_PORT_MIN + 1;

const normalizeProjectPath = (projectPath: string): string => path.resolve(projectPath);

const createStableHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const createProjectHash = (projectPath: string): string =>
  createStableHash(normalizeProjectPath(projectPath));

const canListenOnPort = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });

export const getDevInstanceId = (projectPath: string): string =>
  createProjectHash(projectPath).slice(0, 12);

export const getPreferredDevRendererPort = (projectPath: string): number => {
  const hashPrefix = createProjectHash(projectPath).slice(0, 8);
  const hashValue = Number.parseInt(hashPrefix, 16);

  return DEV_PORT_MIN + (hashValue % DEV_PORT_SPAN);
};

export const findAvailableDevRendererPort = async (projectPath: string): Promise<number> => {
  const preferredPort = getPreferredDevRendererPort(projectPath);

  for (let offset = 0; offset < DEV_PORT_SPAN; offset += 1) {
    const candidatePort =
      DEV_PORT_MIN + ((preferredPort - DEV_PORT_MIN + offset) % DEV_PORT_SPAN);

    if (await canListenOnPort(candidatePort)) {
      return candidatePort;
    }
  }

  throw new Error(
    `Could not find an available dev renderer port in ${DEV_PORT_MIN}-${DEV_PORT_MAX}.`,
  );
};

export const getDevUserDataDir = (projectPath: string): string =>
  path.join(os.tmpdir(), 'devland-dev', getDevInstanceId(projectPath));

// Matches the `db` service in docker-compose.yml, so a fresh clone needs no .env file.
export const DEFAULT_DATABASE_URL =
  "postgres://selah:selah@127.0.0.1:5432/selah";

type Env = Record<string, string | undefined>;

export function databaseUrl(env: Env = process.env): string {
  return env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
}

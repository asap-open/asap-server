import chalk from "chalk";

const methodColor = (method: string) => {
  switch (method) {
    case "GET":
      return chalk.blue(method.padEnd(7));
    case "POST":
      return chalk.green(method.padEnd(7));
    case "PUT":
      return chalk.yellow(method.padEnd(7));
    case "DELETE":
      return chalk.red(method.padEnd(7));
    default:
      return chalk.white(method.padEnd(7));
  }
};

const statusColor = (status: number) => {
  if (status < 300) return chalk.green(status);
  if (status < 400) return chalk.cyan(status);
  if (status < 500) return chalk.yellow(status);
  return chalk.red(status);
};

const ts = () => chalk.gray(new Date().toISOString());

export const logger = {
  request: (method: string, url: string, origin: string) => {
    console.log(
      `${ts()} ${methodColor(method)} ${chalk.white(url)} ${chalk.cyan(`origin:"${origin}"`)}`,
    );
  },

  response: (method: string, url: string, status: number, duration: number) => {
    console.log(
      `${ts()} ${methodColor(method)} ${chalk.white(url)} ${statusColor(status)} ${chalk.gray(`${duration}ms`)}`,
    );
  },

  cors: (origin: string, allowed: boolean) => {
    console.log(
      `${chalk.magenta("[CORS]")} origin:"${chalk.cyan(origin)}" → ${allowed ? chalk.green("allowed") : chalk.red("blocked")}`,
    );
  },

  info: (msg: string) => console.log(chalk.green.bold(msg)),

  warn: (msg: string) => console.log(chalk.yellow(msg)),

  error: (msg: string, err?: unknown) => {
    if (err) console.error(chalk.red(msg), err);
    else console.error(chalk.red(msg));
  },
};

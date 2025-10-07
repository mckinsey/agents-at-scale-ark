import chalk from 'chalk';

export type StatusColor =
  | 'green'
  | 'red'
  | 'yellow'
  | 'gray'
  | 'white'
  | 'cyan'
  | 'bold';

export interface StatusLine {
  icon: string;
  iconColor?: StatusColor;
  status: string;
  statusColor?: StatusColor;
  name: string;
  nameColor?: StatusColor;
  details?: string;
  subtext?: string;
}

export interface StatusSection {
  title: string;
  lines: StatusLine[];
}

/**
 * Simple status formatter that just formats sections and lines
 * The caller is responsible for deciding what to show
 */
export class StatusFormatter {
  public static printSections(sections: StatusSection[]): void {
    console.log();

    sections.forEach((section, index) => {
      console.log(chalk.cyan.bold(section.title));
      section.lines.forEach((line) => this.printLine(line));

      if (index < sections.length - 1) {
        console.log();
      }
    });

    console.log();
  }

  private static applyColor(text: string, color?: StatusColor): string {
    if (!color) return text;

    const colorMap = {
      green: chalk.green,
      red: chalk.red,
      yellow: chalk.yellow,
      gray: chalk.gray,
      white: chalk.white,
      cyan: chalk.cyan,
      bold: chalk.bold,
    };

    return colorMap[color](text);
  }

  private static printLine(line: StatusLine): void {
    const icon = this.applyColor(line.icon, line.iconColor);
    const status = this.applyColor(line.status, line.statusColor);
    // Name formatting is now handled where the name is assembled
    const name = this.applyColor(line.name, line.nameColor || 'white');

    const parts = [
      `  ${icon} ${status}`,
      name,
      line.details ? chalk.gray(line.details) : '',
    ].filter(Boolean);

    console.log(parts.join(' '));

    if (line.subtext) {
      console.log(`    ${chalk.gray(line.subtext)}`);
    }
  }
}

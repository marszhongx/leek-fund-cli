import {
  Container,
  getTerminalColorMode,
  indexedColor,
  Input,
  matchesKey,
  ProcessTerminal,
  styleText,
  Text,
  truncateToWidth,
  TuiMainScreen,
  type Component,
  type Focusable,
  type OverlayHandle,
  type TextStyle,
  type TUI,
} from '@earendil-works/pi-tui';
import { saveConfig, type Config } from './config.js';
import { fetchStocks, type StockData } from './fetch.js';

const PAD = '\u2007';

function paint(text: string, style: TextStyle): string {
  return styleText(text, style, getTerminalColorMode());
}

function padRight(text: string, length: number): string {
  return text + PAD.repeat(Math.max(length - text.length, 0));
}

function formatPercent(percent: string): string {
  const value = parseFloat(percent) || 0;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatPrice(price: string): string {
  const value = parseFloat(price);
  return Number.isNaN(value) ? '-' : value.toFixed(4);
}

function percentOf(stock: StockData): string {
  return (
    ((Number(stock.price) - Number(stock.yestclose)) /
      Number(stock.yestclose)) *
    100
  ).toFixed(2);
}

class Separator implements Component {
  render(width: number): string[] {
    return ['─'.repeat(Math.max(0, width))];
  }

  invalidate(): void {}
}

interface StockListCallbacks {
  onAdd: () => void;
  onDelete: (code: string) => void;
  onRefresh: () => void;
  onQuit: () => void;
}

class StockList implements Component, Focusable {
  focused = false;

  private codes: string[] = [];
  private data = new Map<string, StockData>();
  private selected = 0;

  constructor(
    private readonly getMaxRows: () => number,
    private readonly callbacks: StockListCallbacks
  ) {}

  setData(codes: string[], stocks: StockData[]): void {
    this.codes = [...codes];
    this.data = new Map(stocks.map((stock) => [stock.code, stock]));
    this.selected = Math.max(0, Math.min(this.selected, this.codes.length - 1));
  }

  get selectedCode(): string | undefined {
    return this.codes[this.selected];
  }

  selectCode(code: string): void {
    const index = this.codes.indexOf(code);
    if (index !== -1) {
      this.selected = index;
    }
  }

  handleInput(input: string): void {
    const maxRows = Math.max(1, Math.floor(this.getMaxRows()));

    if (matchesKey(input, 'up')) {
      this.selected = Math.max(0, this.selected - 1);
    } else if (matchesKey(input, 'down')) {
      this.selected = Math.min(this.codes.length - 1, this.selected + 1);
    } else if (matchesKey(input, 'pageUp')) {
      this.selected = Math.max(0, this.selected - maxRows);
    } else if (matchesKey(input, 'pageDown')) {
      this.selected = Math.min(this.codes.length - 1, this.selected + maxRows);
    } else if (matchesKey(input, 'home')) {
      this.selected = 0;
    } else if (matchesKey(input, 'end')) {
      this.selected = Math.max(0, this.codes.length - 1);
    } else if (input === 'a' || input === 'A') {
      this.callbacks.onAdd();
    } else if (input === 'd' || input === 'D') {
      const code = this.selectedCode;
      if (code) {
        this.callbacks.onDelete(code);
      }
    } else if (input === 'r' || input === 'R') {
      this.callbacks.onRefresh();
    } else if (input === 'q' || input === 'Q') {
      this.callbacks.onQuit();
    }
  }

  render(width: number): string[] {
    if (this.codes.length === 0) {
      return [
        paint(
          truncateToWidth('  未配置股票代码，按 a 添加', width, '…', true),
          { dim: true }
        ),
      ];
    }

    const maxRows = Math.max(1, Math.floor(this.getMaxRows()));
    let start = 0;
    if (this.codes.length > maxRows) {
      start = Math.min(
        Math.max(0, this.selected - Math.floor(maxRows / 2)),
        this.codes.length - maxRows
      );
    }
    const end = Math.min(this.codes.length, start + maxRows);

    const lines: string[] = [];
    for (let index = start; index < end; index++) {
      const code = this.codes[index];
      const stock = this.data.get(code);
      const percent = stock ? percentOf(stock) : '0';
      const price = stock ? stock.price : '-';
      const name = stock ? stock.name : code;
      const percentNum = parseFloat(percent) || 0;
      const icon = paint('●', {
        fg: indexedColor(percentNum >= 0 ? 9 : 10),
      });

      let line = `${index === this.selected ? '›' : ' '} ${icon} ${padRight(
        formatPercent(percent),
        8
      )}${padRight(formatPrice(price), 14)}${name}`;
      line = truncateToWidth(line, width, '…', true);

      if (index === this.selected) {
        line = paint(line, { inverse: true });
      }
      lines.push(line);
    }

    return lines;
  }

  invalidate(): void {}
}

class AddStockOverlay extends Container implements Focusable {
  private readonly input: Input;
  private active = false;

  get focused(): boolean {
    return this.active;
  }

  set focused(value: boolean) {
    this.active = value;
    this.input.focused = value;
  }

  constructor(onSubmit: (value: string) => void, onCancel: () => void) {
    super();

    this.addChild(new Text(paint('添加股票代码', { bold: true, fg: indexedColor(6) }), 1, 0));
    this.addChild(
      new Text(paint('例如 sh600000、sz000001、sh513330', { dim: true }), 1, 0)
    );

    this.input = new Input({ placeholder: 'sh600000' });
    this.input.onSubmit = onSubmit;
    this.input.onEscape = onCancel;
    this.addChild(this.input);

    this.addChild(new Text(paint('Enter 确认   Esc 取消', { dim: true }), 1, 0));
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
  }

  invalidate(): void {
    super.invalidate();
    this.input.invalidate();
  }
}

export class LeekFundApp {
  private readonly tui: TUI;
  private readonly list: StockList;
  private readonly statusText: Text;
  private readonly config: Config;
  private readonly configFile: string;

  private stocks: StockData[] = [];
  private timer: NodeJS.Timeout | undefined;
  private overlay: OverlayHandle | undefined;
  private fetching = false;
  private pendingRefresh = false;
  private closing = false;
  private lastUpdated: Date | undefined;
  private error: string | undefined;
  private notice: string | undefined;

  constructor(config: Config, configFile: string) {
    this.config = config;
    this.configFile = configFile;
    this.tui = new TuiMainScreen(new ProcessTerminal());
    this.statusText = new Text('', 1, 0);
    this.list = new StockList(
      () => Math.max(3, (this.tui.terminal.rows || 24) - 7),
      {
        onAdd: () => this.openAddDialog(),
        onDelete: (code) => this.deleteStock(code),
        onRefresh: () => void this.refresh(),
        onQuit: () => this.quit(),
      }
    );
  }

  start(): void {
    this.tui.addChild(
      new Text(paint('leek-fund-cli', { bold: true, fg: indexedColor(6) }), 1, 0)
    );
    this.tui.addChild(this.statusText);
    this.tui.addChild(new Separator());
    this.tui.addChild(this.list);
    this.tui.addChild(new Separator());
    this.tui.addChild(
      new Text(
        paint('↑/↓ 选择   a 添加   d 删除   r 刷新   q 退出', { dim: true }),
        1,
        0
      )
    );

    this.list.setData(this.config.stocks, this.stocks);
    this.updateStatus();
    this.tui.setFocus(this.list);
    this.tui.addInputListener((data) => {
      if (matchesKey(data, 'ctrl+c')) {
        this.quit();
        return { consume: true };
      }
      return undefined;
    });

    this.tui.start();
    void this.refresh();

    this.timer = setInterval(() => {
      void this.refresh();
    }, this.config.interval);
    this.timer.unref();
  }

  stop(): void {
    if (this.closing) {
      return;
    }
    this.closing = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.tui.stop();
  }

  private quit(): void {
    this.stop();
    process.exit(0);
  }

  private openAddDialog(): void {
    const overlay = new AddStockOverlay(
      (value) => {
        this.overlay?.hide();
        this.overlay = undefined;
        void this.addStock(value);
      },
      () => {
        this.overlay?.hide();
        this.overlay = undefined;
        this.tui.setFocus(this.list);
      }
    );

    this.overlay = this.tui.showOverlay(overlay, {
      width: Math.max(30, Math.min(60, this.tui.terminal.columns - 4)),
      anchor: 'center',
      margin: 1,
    });
  }

  private async addStock(raw: string): Promise<void> {
    const code = raw.trim();
    if (!code) {
      return;
    }

    if (this.config.stocks.includes(code)) {
      this.notice = `${code} 已存在`;
      this.updateStatus();
      this.tui.requestRender();
      return;
    }

    this.config.stocks.push(code);
    try {
      saveConfig(this.config, this.configFile);
    } catch (error) {
      this.error = `保存配置失败: ${(error as Error).message}`;
    }

    this.list.setData(this.config.stocks, this.stocks);
    this.list.selectCode(code);
    this.notice = `已添加 ${code}`;
    this.updateStatus();
    this.tui.requestRender();
    await this.refresh();
  }

  private deleteStock(code: string): void {
    const index = this.config.stocks.indexOf(code);
    if (index === -1) {
      return;
    }

    this.config.stocks.splice(index, 1);
    try {
      saveConfig(this.config, this.configFile);
    } catch (error) {
      this.error = `保存配置失败: ${(error as Error).message}`;
    }

    this.stocks = this.stocks.filter((stock) => stock.code !== code);
    this.list.setData(this.config.stocks, this.stocks);
    this.notice = `已删除 ${code}`;
    this.updateStatus();
    this.tui.requestRender();
  }

  private async refresh(): Promise<void> {
    if (this.fetching) {
      this.pendingRefresh = true;
      return;
    }

    if (this.config.stocks.length === 0) {
      this.stocks = [];
      this.error = undefined;
      this.notice = undefined;
      this.list.setData([], []);
      this.updateStatus();
      this.tui.requestRender();
      return;
    }

    this.fetching = true;
    this.notice = undefined;
    this.updateStatus();
    this.tui.requestRender();

    try {
      const result = await fetchStocks(this.config.stocks);
      const configured = new Set(this.config.stocks);
      this.stocks = result.filter((stock) => configured.has(stock.code));
      this.lastUpdated = new Date();
      this.error = undefined;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.fetching = false;
      this.list.setData(this.config.stocks, this.stocks);
      this.updateStatus();
      this.tui.requestRender();

      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        void this.refresh();
      }
    }
  }

  private updateStatus(): void {
    const count = this.config.stocks.length;
    let text: string;

    if (this.fetching) {
      text = `刷新中…  ${count} 只`;
    } else if (this.error) {
      text = paint(`刷新失败: ${this.error}`, { fg: indexedColor(9) });
    } else if (this.notice) {
      text = this.notice;
    } else if (count === 0) {
      text = '未配置股票代码 · 按 a 添加';
    } else if (this.lastUpdated) {
      text = `更新于 ${this.lastUpdated.toLocaleTimeString('zh-CN', {
        hour12: false,
      })} · 每 ${this.config.interval / 1000}s · ${count} 只`;
    } else {
      text = `${count} 只 · 按 r 刷新`;
    }

    this.statusText.setText(text);
  }
}

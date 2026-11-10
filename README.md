# leek-fund-cli

股票行情终端界面。基于 [pi-tui](https://github.com/earendil-works/pi)（与 pi coding agent 相同的 TUI 库），数据来自新浪财经。

## 安装

```bash
npm install -g leek-fund-cli
leek-fund-cli
```

需要 Node.js >= 22.19.0。

## 快捷键

| 按键 | 作用 |
|---|---|
| `↑` / `↓`、`PgUp` / `PgDn`、`Home` / `End` | 选择股票 |
| `a` | 添加股票代码 |
| `d` | 删除选中的股票代码 |
| `r` | 立即刷新 |
| `q` / `Ctrl+C` | 退出 |

行情每 10 秒自动刷新，涨红跌绿，展示格式为 `涨跌幅 现价 名称`。

## 配置

默认配置文件：`~/.leek-fund-cli/config.json`

```json
{
  "stocks": [
    "sh000001",
    "sz399001",
    "sh600036"
  ],
  "interval": 10000
}
```

- `stocks`：股票代码列表，支持 A 股（`sh` / `sz` / `bj`）、港股（`gb_`）、美股（`usr_`）、国内期货（`nf_`）、国际期货（`hf_`）。
- `interval`：刷新间隔（毫秒），最小 1000。

也可指定其他配置文件：

```bash
leek-fund-cli --config path/to/config.json
LEEK_FUND_CLI_CONFIG=path/to/config.json leek-fund-cli
```

在 TUI 中添加、删除代码会立即写回配置文件。

## 开发

```bash
npm install
npm run build
node dist/cli.js
```

## 免责声明

行情数据来自新浪财经公开接口，仅供学习与参考，不构成投资建议。

# Machine Simulator

Standalone simulator project for vending machine socket flow.

## Setup

1. Install dependencies:
```bash
npm install
```
2. Create env file:
```bash
cp .env.example .env
```
3. Start simulator:
```bash
npm run start
```

## Env variables

- `BACKEND_URL`: Backend socket URL.
- `MACHINE_ID`: Machine identifier, for example `M01`.
- `MACHINE_TOKEN`: Token expected by backend for this machine.
- `SIM_HEARTBEAT_MS`: Heartbeat interval.
- `SIM_DISPENSE_DELAY_MS`: Delay before sending `machine:done`.
- `SIM_FAIL_RATE`: Number between `0` and `1`.

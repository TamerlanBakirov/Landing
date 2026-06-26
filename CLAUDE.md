# AI Web Agency

Autonomous multi-agent system for finding local businesses in Hungary that need websites, generating personalized proposals, and managing the sales pipeline.

## Quick Start

```bash
npm install
node scripts/orchestrator.js --full-pipeline    # Run complete pipeline
node scripts/orchestrator.js --city "Budapest"   # Single city
node scripts/orchestrator.js --stage scout       # Single stage
node scripts/status.js                           # Dashboard
```

## Architecture

7 agents communicate through JSON files in `/database/`:

1. **Scout** - Searches Google Maps for businesses without/with outdated websites
2. **Diagnoser** - Analyzes websites for issues (SEO, mobile, speed, design)
3. **Builder** - Generates HTML + React landing pages per business
4. **Filmmaker** - Creates promotional video frames and scripts
5. **Checker** - Quality verification (95% confidence threshold)
6. **Pitcher** - Prepares personalized outreach (30/day limit)
7. **Mobile** - Monitors responses, detects buying intent, schedules meetings

## Configuration

All settings in `config.json`: target country/cities, pricing packages, daily limits, scoring thresholds.

## State

- `database/leads.json` - All leads with scores and stages
- `database/diagnosis/` - Per-lead audit reports
- `database/campaigns.json` - Outreach tracking
- `database/responses.json` - Response monitoring
- `projects/{slug}/` - Generated websites per business

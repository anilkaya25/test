# Pirates of the Seven Seas

A browser-based pirate strategy game similar to OGame. Build your island, construct ships, research technologies, and conquer the seas!

## Features

- **Resource Management**: Collect Gold, Rum, Wood, and Iron
- **Building System**: Construct and upgrade 10 different buildings
- **Ship Building**: Build 6 types of ships from Sloops to Man-o-Wars
- **Research Tree**: 8 different technologies to research
- **Fleet Missions**: Attack enemies, transport resources, or spy on rivals
- **Galaxy Map**: Explore the seas and find other players
- **Battle System**: Engage in naval combat with detailed battle reports
- **Rankings**: Compete with other players for the top spot

## Buildings

| Building | Effect |
|----------|--------|
| Gold Mine | Produces gold doubloons |
| Rum Distillery | Produces rum for your crew |
| Lumber Mill | Produces wood for construction |
| Iron Foundry | Produces iron for ships and weapons |
| Warehouse | Stores your resources safely |
| Shipyard | Build and repair ships |
| Tavern | Recruit crew members |
| Pirate Academy | Research new technologies |
| Fortress | Defends your island from attacks |
| Lookout Tower | Detects incoming enemy fleets |

## Ships

| Ship | Attack | Defense | Cargo | Speed | Shipyard Level |
|------|--------|---------|-------|-------|----------------|
| Sloop | 15 | 10 | 100 | 150 | 1 |
| Brigantine | 40 | 30 | 300 | 120 | 2 |
| Schooner | 10 | 15 | 600 | 140 | 2 |
| Galleon | 30 | 60 | 2000 | 60 | 3 |
| Frigate | 100 | 80 | 500 | 100 | 4 |
| Man-o-War | 250 | 200 | 800 | 80 | 6 |

## Technologies

- **Navigation**: Increases fleet speed
- **Cannon Mastery**: Increases attack power
- **Ship Armor**: Increases defense power
- **Plundering**: Increases loot from battles
- **Cargo Expansion**: Increases cargo capacity
- **Mining Efficiency**: Increases resource production
- **Espionage**: Better spy reports
- **Shipwright**: Faster ship construction

## Installation

1. Make sure you have Node.js 18+ installed

2. Install dependencies:
   ```bash
   cd pirate-game
   npm install
   ```

3. Initialize the database:
   ```bash
   npm run init-db
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open your browser and navigate to `http://localhost:3000`

## Development

For development with auto-reload:
```bash
npm run dev
```

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Authentication**: JWT

## Game Mechanics

### Resource Production
- Resources are produced hourly based on building levels
- Production rate increases with building upgrades
- Research can boost production rates

### Combat System
- Fleet power = sum of (ship_attack * quantity * bonuses)
- Defense power = sum of (ship_defense * quantity * bonuses)
- Winner is determined by comparing total attack vs defense
- Losses are calculated based on battle ratio
- Victorious attackers can loot up to 50% of defender's resources

### Building Costs
- Costs increase by 1.5x per level
- Build times increase by 1.4x per level

### Research Costs
- Costs increase by 2x per level
- Research times increase by 1.5x per level

## License

MIT

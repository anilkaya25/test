const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'pirate_game.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Islands (player bases)
CREATE TABLE IF NOT EXISTS islands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Tortuga',
    x_coord INTEGER NOT NULL,
    y_coord INTEGER NOT NULL,
    is_main INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Resources for each island
CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    island_id INTEGER NOT NULL UNIQUE,
    gold REAL DEFAULT 500,
    rum REAL DEFAULT 300,
    wood REAL DEFAULT 400,
    iron REAL DEFAULT 200,
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (island_id) REFERENCES islands(id) ON DELETE CASCADE
);

-- Building definitions
CREATE TABLE IF NOT EXISTS building_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    base_gold_cost INTEGER DEFAULT 0,
    base_rum_cost INTEGER DEFAULT 0,
    base_wood_cost INTEGER DEFAULT 0,
    base_iron_cost INTEGER DEFAULT 0,
    base_build_time INTEGER DEFAULT 60,
    cost_factor REAL DEFAULT 1.5,
    time_factor REAL DEFAULT 1.4,
    effect_type TEXT,
    effect_value REAL DEFAULT 0
);

-- Player buildings on islands
CREATE TABLE IF NOT EXISTS buildings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    island_id INTEGER NOT NULL,
    building_type_id INTEGER NOT NULL,
    level INTEGER DEFAULT 0,
    is_upgrading INTEGER DEFAULT 0,
    upgrade_finish_time DATETIME,
    FOREIGN KEY (island_id) REFERENCES islands(id) ON DELETE CASCADE,
    FOREIGN KEY (building_type_id) REFERENCES building_types(id),
    UNIQUE(island_id, building_type_id)
);

-- Ship definitions
CREATE TABLE IF NOT EXISTS ship_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    gold_cost INTEGER DEFAULT 0,
    rum_cost INTEGER DEFAULT 0,
    wood_cost INTEGER DEFAULT 0,
    iron_cost INTEGER DEFAULT 0,
    build_time INTEGER DEFAULT 120,
    attack_power INTEGER DEFAULT 10,
    defense_power INTEGER DEFAULT 10,
    cargo_capacity INTEGER DEFAULT 100,
    speed INTEGER DEFAULT 100,
    required_shipyard_level INTEGER DEFAULT 1
);

-- Player ships on islands
CREATE TABLE IF NOT EXISTS ships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    island_id INTEGER NOT NULL,
    ship_type_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 0,
    FOREIGN KEY (island_id) REFERENCES islands(id) ON DELETE CASCADE,
    FOREIGN KEY (ship_type_id) REFERENCES ship_types(id),
    UNIQUE(island_id, ship_type_id)
);

-- Ship build queue
CREATE TABLE IF NOT EXISTS ship_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    island_id INTEGER NOT NULL,
    ship_type_id INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    finish_time DATETIME NOT NULL,
    FOREIGN KEY (island_id) REFERENCES islands(id) ON DELETE CASCADE,
    FOREIGN KEY (ship_type_id) REFERENCES ship_types(id)
);

-- Research/Technology definitions
CREATE TABLE IF NOT EXISTS research_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    base_gold_cost INTEGER DEFAULT 0,
    base_rum_cost INTEGER DEFAULT 0,
    base_wood_cost INTEGER DEFAULT 0,
    base_iron_cost INTEGER DEFAULT 0,
    base_research_time INTEGER DEFAULT 300,
    cost_factor REAL DEFAULT 2.0,
    time_factor REAL DEFAULT 1.5,
    effect_type TEXT,
    effect_value REAL DEFAULT 0,
    required_academy_level INTEGER DEFAULT 1
);

-- Player research progress
CREATE TABLE IF NOT EXISTS research (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    research_type_id INTEGER NOT NULL,
    level INTEGER DEFAULT 0,
    is_researching INTEGER DEFAULT 0,
    research_finish_time DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (research_type_id) REFERENCES research_types(id),
    UNIQUE(user_id, research_type_id)
);

-- Fleet missions
CREATE TABLE IF NOT EXISTS fleet_missions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    origin_island_id INTEGER NOT NULL,
    target_island_id INTEGER,
    target_x INTEGER,
    target_y INTEGER,
    mission_type TEXT NOT NULL,
    ships_data TEXT NOT NULL,
    cargo_gold REAL DEFAULT 0,
    cargo_rum REAL DEFAULT 0,
    cargo_wood REAL DEFAULT 0,
    cargo_iron REAL DEFAULT 0,
    departure_time DATETIME NOT NULL,
    arrival_time DATETIME NOT NULL,
    return_time DATETIME,
    status TEXT DEFAULT 'traveling',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (origin_island_id) REFERENCES islands(id) ON DELETE CASCADE
);

-- Battle reports
CREATE TABLE IF NOT EXISTS battle_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker_id INTEGER NOT NULL,
    defender_id INTEGER,
    target_x INTEGER,
    target_y INTEGER,
    attacker_ships TEXT,
    defender_ships TEXT,
    attacker_losses TEXT,
    defender_losses TEXT,
    loot_gold REAL DEFAULT 0,
    loot_rum REAL DEFAULT 0,
    loot_wood REAL DEFAULT 0,
    loot_iron REAL DEFAULT 0,
    winner TEXT,
    battle_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_read_attacker INTEGER DEFAULT 0,
    is_read_defender INTEGER DEFAULT 0,
    FOREIGN KEY (attacker_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Messages between players
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_id INTEGER NOT NULL,
    subject TEXT,
    body TEXT,
    is_read INTEGER DEFAULT 0,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Scores/Rankings
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    total_score INTEGER DEFAULT 0,
    building_score INTEGER DEFAULT 0,
    research_score INTEGER DEFAULT 0,
    fleet_score INTEGER DEFAULT 0,
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

// Execute schema
db.exec(schema);

// Insert default building types
const buildingTypes = [
    { name: 'Gold Mine', description: 'Produces gold doubloons', base_gold_cost: 60, base_rum_cost: 15, base_wood_cost: 40, base_iron_cost: 0, base_build_time: 60, effect_type: 'gold_production', effect_value: 30 },
    { name: 'Rum Distillery', description: 'Produces rum for your crew', base_gold_cost: 48, base_rum_cost: 24, base_wood_cost: 40, base_iron_cost: 0, base_build_time: 75, effect_type: 'rum_production', effect_value: 20 },
    { name: 'Lumber Mill', description: 'Produces wood for construction', base_gold_cost: 50, base_rum_cost: 20, base_wood_cost: 0, base_iron_cost: 0, base_build_time: 60, effect_type: 'wood_production', effect_value: 25 },
    { name: 'Iron Foundry', description: 'Produces iron for ships and weapons', base_gold_cost: 75, base_rum_cost: 25, base_wood_cost: 60, base_iron_cost: 0, base_build_time: 90, effect_type: 'iron_production', effect_value: 15 },
    { name: 'Warehouse', description: 'Stores your resources safely', base_gold_cost: 100, base_rum_cost: 0, base_wood_cost: 100, base_iron_cost: 20, base_build_time: 100, effect_type: 'storage_capacity', effect_value: 5000 },
    { name: 'Shipyard', description: 'Build and repair ships', base_gold_cost: 200, base_rum_cost: 50, base_wood_cost: 200, base_iron_cost: 100, base_build_time: 180, effect_type: 'ship_build_speed', effect_value: 0.05 },
    { name: 'Tavern', description: 'Recruit crew members', base_gold_cost: 150, base_rum_cost: 100, base_wood_cost: 100, base_iron_cost: 0, base_build_time: 120, effect_type: 'crew_capacity', effect_value: 50 },
    { name: 'Pirate Academy', description: 'Research new technologies', base_gold_cost: 300, base_rum_cost: 100, base_wood_cost: 200, base_iron_cost: 150, base_build_time: 240, effect_type: 'research_speed', effect_value: 0.05 },
    { name: 'Fortress', description: 'Defends your island from attacks', base_gold_cost: 400, base_rum_cost: 50, base_wood_cost: 300, base_iron_cost: 200, base_build_time: 300, effect_type: 'defense_bonus', effect_value: 0.1 },
    { name: 'Lookout Tower', description: 'Detects incoming enemy fleets', base_gold_cost: 150, base_rum_cost: 30, base_wood_cost: 100, base_iron_cost: 50, base_build_time: 150, effect_type: 'detection_range', effect_value: 1 }
];

const insertBuilding = db.prepare(`
    INSERT OR IGNORE INTO building_types (name, description, base_gold_cost, base_rum_cost, base_wood_cost, base_iron_cost, base_build_time, effect_type, effect_value)
    VALUES (@name, @description, @base_gold_cost, @base_rum_cost, @base_wood_cost, @base_iron_cost, @base_build_time, @effect_type, @effect_value)
`);

for (const building of buildingTypes) {
    insertBuilding.run(building);
}

// Insert ship types
const shipTypes = [
    { name: 'Sloop', description: 'Fast and light scout ship', gold_cost: 200, rum_cost: 50, wood_cost: 150, iron_cost: 30, build_time: 120, attack_power: 15, defense_power: 10, cargo_capacity: 100, speed: 150, required_shipyard_level: 1 },
    { name: 'Brigantine', description: 'Versatile medium warship', gold_cost: 500, rum_cost: 100, wood_cost: 400, iron_cost: 100, build_time: 300, attack_power: 40, defense_power: 30, cargo_capacity: 300, speed: 120, required_shipyard_level: 2 },
    { name: 'Frigate', description: 'Heavy warship with good firepower', gold_cost: 1000, rum_cost: 200, wood_cost: 800, iron_cost: 300, build_time: 600, attack_power: 100, defense_power: 80, cargo_capacity: 500, speed: 100, required_shipyard_level: 4 },
    { name: 'Galleon', description: 'Massive cargo ship', gold_cost: 1500, rum_cost: 150, wood_cost: 1200, iron_cost: 200, build_time: 900, attack_power: 30, defense_power: 60, cargo_capacity: 2000, speed: 60, required_shipyard_level: 3 },
    { name: 'Man-o-War', description: 'Ultimate warship of the seas', gold_cost: 3000, rum_cost: 500, wood_cost: 2000, iron_cost: 800, build_time: 1800, attack_power: 250, defense_power: 200, cargo_capacity: 800, speed: 80, required_shipyard_level: 6 },
    { name: 'Schooner', description: 'Fast transport ship', gold_cost: 400, rum_cost: 80, wood_cost: 300, iron_cost: 50, build_time: 240, attack_power: 10, defense_power: 15, cargo_capacity: 600, speed: 140, required_shipyard_level: 2 }
];

const insertShip = db.prepare(`
    INSERT OR IGNORE INTO ship_types (name, description, gold_cost, rum_cost, wood_cost, iron_cost, build_time, attack_power, defense_power, cargo_capacity, speed, required_shipyard_level)
    VALUES (@name, @description, @gold_cost, @rum_cost, @wood_cost, @iron_cost, @build_time, @attack_power, @defense_power, @cargo_capacity, @speed, @required_shipyard_level)
`);

for (const ship of shipTypes) {
    insertShip.run(ship);
}

// Insert research types
const researchTypes = [
    { name: 'Navigation', description: 'Increases fleet speed', base_gold_cost: 200, base_rum_cost: 100, base_wood_cost: 0, base_iron_cost: 0, base_research_time: 300, effect_type: 'fleet_speed', effect_value: 0.1, required_academy_level: 1 },
    { name: 'Cannon Mastery', description: 'Increases attack power', base_gold_cost: 400, base_rum_cost: 100, base_wood_cost: 0, base_iron_cost: 200, base_research_time: 450, effect_type: 'attack_bonus', effect_value: 0.1, required_academy_level: 2 },
    { name: 'Ship Armor', description: 'Increases defense power', base_gold_cost: 350, base_rum_cost: 50, base_wood_cost: 200, base_iron_cost: 250, base_research_time: 450, effect_type: 'defense_bonus', effect_value: 0.1, required_academy_level: 2 },
    { name: 'Plundering', description: 'Increases loot from battles', base_gold_cost: 300, base_rum_cost: 150, base_wood_cost: 0, base_iron_cost: 0, base_research_time: 360, effect_type: 'loot_bonus', effect_value: 0.1, required_academy_level: 1 },
    { name: 'Cargo Expansion', description: 'Increases cargo capacity', base_gold_cost: 250, base_rum_cost: 50, base_wood_cost: 300, base_iron_cost: 100, base_research_time: 300, effect_type: 'cargo_bonus', effect_value: 0.15, required_academy_level: 1 },
    { name: 'Mining Efficiency', description: 'Increases resource production', base_gold_cost: 500, base_rum_cost: 200, base_wood_cost: 200, base_iron_cost: 100, base_research_time: 600, effect_type: 'production_bonus', effect_value: 0.1, required_academy_level: 3 },
    { name: 'Espionage', description: 'Better spy reports', base_gold_cost: 400, base_rum_cost: 200, base_wood_cost: 0, base_iron_cost: 0, base_research_time: 400, effect_type: 'spy_power', effect_value: 1, required_academy_level: 2 },
    { name: 'Shipwright', description: 'Faster ship construction', base_gold_cost: 600, base_rum_cost: 100, base_wood_cost: 400, base_iron_cost: 200, base_research_time: 500, effect_type: 'build_speed', effect_value: 0.1, required_academy_level: 3 }
];

const insertResearch = db.prepare(`
    INSERT OR IGNORE INTO research_types (name, description, base_gold_cost, base_rum_cost, base_wood_cost, base_iron_cost, base_research_time, effect_type, effect_value, required_academy_level)
    VALUES (@name, @description, @base_gold_cost, @base_rum_cost, @base_wood_cost, @base_iron_cost, @base_research_time, @effect_type, @effect_value, @required_academy_level)
`);

for (const research of researchTypes) {
    insertResearch.run(research);
}

console.log('Database initialized successfully!');
db.close();

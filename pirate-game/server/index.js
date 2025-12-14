const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pirate-secret-key-change-in-production';

// Database setup with sql.js
let db;
const dbPath = path.join(__dirname, '..', 'database', 'pirate_game.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
async function initDatabase() {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();

    // Try to load existing database
    try {
        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
            console.log('Loaded existing database');
        } else {
            db = new SQL.Database();
            console.log('Created new database');
            createTables();
        }
    } catch (error) {
        console.error('Error loading database:', error);
        db = new SQL.Database();
        createTables();
    }
}

function saveDatabase() {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

// Save database periodically
setInterval(saveDatabase, 30000);

function createTables() {
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

    db.run(schema);

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

    for (const building of buildingTypes) {
        db.run(`INSERT OR IGNORE INTO building_types (name, description, base_gold_cost, base_rum_cost, base_wood_cost, base_iron_cost, base_build_time, effect_type, effect_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [building.name, building.description, building.base_gold_cost, building.base_rum_cost, building.base_wood_cost, building.base_iron_cost, building.base_build_time, building.effect_type, building.effect_value]);
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

    for (const ship of shipTypes) {
        db.run(`INSERT OR IGNORE INTO ship_types (name, description, gold_cost, rum_cost, wood_cost, iron_cost, build_time, attack_power, defense_power, cargo_capacity, speed, required_shipyard_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ship.name, ship.description, ship.gold_cost, ship.rum_cost, ship.wood_cost, ship.iron_cost, ship.build_time, ship.attack_power, ship.defense_power, ship.cargo_capacity, ship.speed, ship.required_shipyard_level]);
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

    for (const research of researchTypes) {
        db.run(`INSERT OR IGNORE INTO research_types (name, description, base_gold_cost, base_rum_cost, base_wood_cost, base_iron_cost, base_research_time, effect_type, effect_value, required_academy_level)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [research.name, research.description, research.base_gold_cost, research.base_rum_cost, research.base_wood_cost, research.base_iron_cost, research.base_research_time, research.effect_type, research.effect_value, research.required_academy_level]);
    }

    saveDatabase();
    console.log('Database tables created successfully!');
}

// Helper functions
function dbGet(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

function dbAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function dbRun(sql, params = []) {
    db.run(sql, params);
    return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0 };
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

// Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// =====================
// GAME LOGIC HELPERS
// =====================

function updateResources(islandId) {
    const island = dbGet('SELECT * FROM islands WHERE id = ?', [islandId]);
    if (!island) return null;

    const resources = dbGet('SELECT * FROM resources WHERE island_id = ?', [islandId]);
    if (!resources) return null;

    const now = new Date();
    const lastUpdate = new Date(resources.last_update);
    const hoursPassed = (now - lastUpdate) / (1000 * 60 * 60);

    if (hoursPassed <= 0) return resources;

    const buildings = dbAll(`
        SELECT b.level, bt.effect_type, bt.effect_value
        FROM buildings b
        JOIN building_types bt ON b.building_type_id = bt.id
        WHERE b.island_id = ? AND b.level > 0
    `, [islandId]);

    let goldProduction = 20;
    let rumProduction = 10;
    let woodProduction = 15;
    let ironProduction = 5;
    let storageCapacity = 10000;

    for (const building of buildings) {
        const levelMultiplier = Math.pow(1.1, building.level - 1);
        switch (building.effect_type) {
            case 'gold_production':
                goldProduction += building.effect_value * building.level * levelMultiplier;
                break;
            case 'rum_production':
                rumProduction += building.effect_value * building.level * levelMultiplier;
                break;
            case 'wood_production':
                woodProduction += building.effect_value * building.level * levelMultiplier;
                break;
            case 'iron_production':
                ironProduction += building.effect_value * building.level * levelMultiplier;
                break;
            case 'storage_capacity':
                storageCapacity += building.effect_value * building.level;
                break;
        }
    }

    const research = dbAll(`
        SELECT r.level, rt.effect_type, rt.effect_value
        FROM research r
        JOIN research_types rt ON r.research_type_id = rt.id
        WHERE r.user_id = ? AND r.level > 0
    `, [island.user_id]);

    let productionBonus = 1;
    for (const tech of research) {
        if (tech.effect_type === 'production_bonus') {
            productionBonus += tech.effect_value * tech.level;
        }
    }

    let newGold = Math.min(resources.gold + (goldProduction * hoursPassed * productionBonus), storageCapacity);
    let newRum = Math.min(resources.rum + (rumProduction * hoursPassed * productionBonus), storageCapacity);
    let newWood = Math.min(resources.wood + (woodProduction * hoursPassed * productionBonus), storageCapacity);
    let newIron = Math.min(resources.iron + (ironProduction * hoursPassed * productionBonus), storageCapacity);

    dbRun(`UPDATE resources SET gold = ?, rum = ?, wood = ?, iron = ?, last_update = ? WHERE island_id = ?`,
        [newGold, newRum, newWood, newIron, now.toISOString(), islandId]);

    return {
        gold: Math.floor(newGold),
        rum: Math.floor(newRum),
        wood: Math.floor(newWood),
        iron: Math.floor(newIron),
        production: {
            gold: Math.floor(goldProduction * productionBonus),
            rum: Math.floor(rumProduction * productionBonus),
            wood: Math.floor(woodProduction * productionBonus),
            iron: Math.floor(ironProduction * productionBonus)
        },
        storageCapacity: Math.floor(storageCapacity)
    };
}

function processBuildings(islandId) {
    const now = new Date().toISOString();
    const completedUpgrades = dbAll(`
        SELECT * FROM buildings WHERE island_id = ? AND is_upgrading = 1 AND upgrade_finish_time <= ?
    `, [islandId, now]);

    for (const building of completedUpgrades) {
        dbRun(`UPDATE buildings SET level = level + 1, is_upgrading = 0, upgrade_finish_time = NULL WHERE id = ?`, [building.id]);
    }
}

function processShipQueue(islandId) {
    const now = new Date().toISOString();
    const completedShips = dbAll(`SELECT * FROM ship_queue WHERE island_id = ? AND finish_time <= ?`, [islandId, now]);

    for (const queue of completedShips) {
        const existing = dbGet(`SELECT * FROM ships WHERE island_id = ? AND ship_type_id = ?`, [islandId, queue.ship_type_id]);
        if (existing) {
            dbRun(`UPDATE ships SET quantity = quantity + ? WHERE island_id = ? AND ship_type_id = ?`,
                [queue.quantity, islandId, queue.ship_type_id]);
        } else {
            dbRun(`INSERT INTO ships (island_id, ship_type_id, quantity) VALUES (?, ?, ?)`,
                [islandId, queue.ship_type_id, queue.quantity]);
        }
        dbRun('DELETE FROM ship_queue WHERE id = ?', [queue.id]);
    }
}

function processResearch(userId) {
    const now = new Date().toISOString();
    const completedResearch = dbAll(`
        SELECT * FROM research WHERE user_id = ? AND is_researching = 1 AND research_finish_time <= ?
    `, [userId, now]);

    for (const research of completedResearch) {
        dbRun(`UPDATE research SET level = level + 1, is_researching = 0, research_finish_time = NULL WHERE id = ?`, [research.id]);
    }
}

function getBuildingCost(buildingType, currentLevel) {
    const factor = Math.pow(buildingType.cost_factor, currentLevel);
    const timeFactor = Math.pow(buildingType.time_factor, currentLevel);

    return {
        gold: Math.floor(buildingType.base_gold_cost * factor),
        rum: Math.floor(buildingType.base_rum_cost * factor),
        wood: Math.floor(buildingType.base_wood_cost * factor),
        iron: Math.floor(buildingType.base_iron_cost * factor),
        time: Math.floor(buildingType.base_build_time * timeFactor)
    };
}

function getResearchCost(researchType, currentLevel) {
    const factor = Math.pow(researchType.cost_factor, currentLevel);
    const timeFactor = Math.pow(researchType.time_factor, currentLevel);

    return {
        gold: Math.floor(researchType.base_gold_cost * factor),
        rum: Math.floor(researchType.base_rum_cost * factor),
        wood: Math.floor(researchType.base_wood_cost * factor),
        iron: Math.floor(researchType.base_iron_cost * factor),
        time: Math.floor(researchType.base_research_time * timeFactor)
    };
}

function updateScore(userId) {
    const user = dbGet('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) return;

    const buildingResult = dbGet(`
        SELECT COALESCE(SUM(b.level * 100), 0) as score
        FROM buildings b JOIN islands i ON b.island_id = i.id WHERE i.user_id = ?
    `, [userId]);
    const buildingScore = buildingResult?.score || 0;

    const researchResult = dbGet(`SELECT COALESCE(SUM(level * 200), 0) as score FROM research WHERE user_id = ?`, [userId]);
    const researchScore = researchResult?.score || 0;

    const fleetResult = dbGet(`
        SELECT COALESCE(SUM(s.quantity * st.attack_power), 0) as score
        FROM ships s JOIN ship_types st ON s.ship_type_id = st.id
        JOIN islands i ON s.island_id = i.id WHERE i.user_id = ?
    `, [userId]);
    const fleetScore = fleetResult?.score || 0;

    const totalScore = buildingScore + researchScore + fleetScore;

    const existing = dbGet('SELECT * FROM scores WHERE user_id = ?', [userId]);
    if (existing) {
        dbRun(`UPDATE scores SET total_score = ?, building_score = ?, research_score = ?, fleet_score = ?, last_update = CURRENT_TIMESTAMP WHERE user_id = ?`,
            [totalScore, buildingScore, researchScore, fleetScore, userId]);
    } else {
        dbRun(`INSERT INTO scores (user_id, total_score, building_score, research_score, fleet_score) VALUES (?, ?, ?, ?, ?)`,
            [userId, totalScore, buildingScore, researchScore, fleetScore]);
    }
}

// =====================
// API ROUTES
// =====================

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const existingUser = dbGet('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = dbRun('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)', [username, email, passwordHash]);
        const userId = result.lastInsertRowid;

        const x = Math.floor(Math.random() * 500) + 1;
        const y = Math.floor(Math.random() * 500) + 1;

        const islandResult = dbRun('INSERT INTO islands (user_id, name, x_coord, y_coord) VALUES (?, ?, ?, ?)', [userId, 'Tortuga', x, y]);
        const islandId = islandResult.lastInsertRowid;

        dbRun('INSERT INTO resources (island_id) VALUES (?)', [islandId]);

        const buildingTypes = dbAll('SELECT id FROM building_types');
        for (const bt of buildingTypes) {
            dbRun('INSERT INTO buildings (island_id, building_type_id) VALUES (?, ?)', [islandId, bt.id]);
        }

        const shipTypes = dbAll('SELECT id FROM ship_types');
        for (const st of shipTypes) {
            dbRun('INSERT INTO ships (island_id, ship_type_id) VALUES (?, ?)', [islandId, st.id]);
        }

        const researchTypes = dbAll('SELECT id FROM research_types');
        for (const rt of researchTypes) {
            dbRun('INSERT INTO research (user_id, research_type_id) VALUES (?, ?)', [userId, rt.id]);
        }

        dbRun('INSERT INTO scores (user_id) VALUES (?)', [userId]);
        saveDatabase();

        const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: userId, username, email } });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const user = dbGet('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        dbRun('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/api/game/overview', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;

        const islands = dbAll('SELECT * FROM islands WHERE user_id = ?', [userId]);
        for (const island of islands) {
            processBuildings(island.id);
            processShipQueue(island.id);
        }
        processResearch(userId);

        const mainIsland = islands.find(i => i.is_main) || islands[0];
        if (!mainIsland) {
            return res.status(404).json({ error: 'No island found' });
        }

        const resources = updateResources(mainIsland.id);

        const buildings = dbAll(`
            SELECT b.*, bt.name, bt.description, bt.effect_type, bt.effect_value,
                   bt.base_gold_cost, bt.base_rum_cost, bt.base_wood_cost, bt.base_iron_cost,
                   bt.base_build_time, bt.cost_factor, bt.time_factor
            FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ? ORDER BY bt.id
        `, [mainIsland.id]);

        const buildingsWithCosts = buildings.map(b => ({
            ...b,
            nextLevelCost: getBuildingCost({
                base_gold_cost: b.base_gold_cost, base_rum_cost: b.base_rum_cost,
                base_wood_cost: b.base_wood_cost, base_iron_cost: b.base_iron_cost,
                base_build_time: b.base_build_time, cost_factor: b.cost_factor, time_factor: b.time_factor
            }, b.level)
        }));

        const ships = dbAll(`
            SELECT s.*, st.name, st.description, st.gold_cost, st.rum_cost, st.wood_cost, st.iron_cost,
                   st.build_time, st.attack_power, st.defense_power, st.cargo_capacity, st.speed, st.required_shipyard_level
            FROM ships s JOIN ship_types st ON s.ship_type_id = st.id
            WHERE s.island_id = ? ORDER BY st.id
        `, [mainIsland.id]);

        const shipQueue = dbAll(`
            SELECT sq.*, st.name FROM ship_queue sq
            JOIN ship_types st ON sq.ship_type_id = st.id
            WHERE sq.island_id = ? ORDER BY sq.finish_time
        `, [mainIsland.id]);

        const research = dbAll(`
            SELECT r.*, rt.name, rt.description, rt.effect_type, rt.effect_value,
                   rt.base_gold_cost, rt.base_rum_cost, rt.base_wood_cost, rt.base_iron_cost,
                   rt.base_research_time, rt.cost_factor, rt.time_factor, rt.required_academy_level
            FROM research r JOIN research_types rt ON r.research_type_id = rt.id
            WHERE r.user_id = ? ORDER BY rt.id
        `, [userId]);

        const researchWithCosts = research.map(r => ({
            ...r,
            nextLevelCost: getResearchCost({
                base_gold_cost: r.base_gold_cost, base_rum_cost: r.base_rum_cost,
                base_wood_cost: r.base_wood_cost, base_iron_cost: r.base_iron_cost,
                base_research_time: r.base_research_time, cost_factor: r.cost_factor, time_factor: r.time_factor
            }, r.level)
        }));

        const missions = dbAll(`
            SELECT fm.*, i.name as target_name FROM fleet_missions fm
            LEFT JOIN islands i ON fm.target_island_id = i.id
            WHERE fm.user_id = ? ORDER BY fm.arrival_time
        `, [userId]);

        updateScore(userId);
        const score = dbGet('SELECT * FROM scores WHERE user_id = ?', [userId]);

        const shipyard = buildings.find(b => b.name === 'Shipyard');
        const academy = buildings.find(b => b.name === 'Pirate Academy');

        res.json({
            island: mainIsland, resources, buildings: buildingsWithCosts, ships, shipQueue,
            research: researchWithCosts, missions, score,
            shipyardLevel: shipyard?.level || 0, academyLevel: academy?.level || 0
        });
    } catch (error) {
        console.error('Overview error:', error);
        res.status(500).json({ error: 'Failed to get overview' });
    }
});

app.post('/api/game/buildings/upgrade', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { buildingId } = req.body;

        const building = dbGet(`
            SELECT b.*, bt.name, bt.base_gold_cost, bt.base_rum_cost, bt.base_wood_cost, bt.base_iron_cost,
                   bt.base_build_time, bt.cost_factor, bt.time_factor, i.id as island_id
            FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            JOIN islands i ON b.island_id = i.id
            WHERE b.id = ? AND i.user_id = ?
        `, [buildingId, userId]);

        if (!building) return res.status(404).json({ error: 'Building not found' });
        if (building.is_upgrading) return res.status(400).json({ error: 'Building is already upgrading' });

        const upgradingBuilding = dbGet(`SELECT * FROM buildings WHERE island_id = ? AND is_upgrading = 1`, [building.island_id]);
        if (upgradingBuilding) return res.status(400).json({ error: 'Another building is already upgrading' });

        const cost = getBuildingCost({
            base_gold_cost: building.base_gold_cost, base_rum_cost: building.base_rum_cost,
            base_wood_cost: building.base_wood_cost, base_iron_cost: building.base_iron_cost,
            base_build_time: building.base_build_time, cost_factor: building.cost_factor, time_factor: building.time_factor
        }, building.level);

        const resources = updateResources(building.island_id);
        if (resources.gold < cost.gold || resources.rum < cost.rum || resources.wood < cost.wood || resources.iron < cost.iron) {
            return res.status(400).json({ error: 'Insufficient resources' });
        }

        dbRun(`UPDATE resources SET gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ? WHERE island_id = ?`,
            [cost.gold, cost.rum, cost.wood, cost.iron, building.island_id]);

        const finishTime = new Date(Date.now() + cost.time * 1000);
        dbRun(`UPDATE buildings SET is_upgrading = 1, upgrade_finish_time = ? WHERE id = ?`, [finishTime.toISOString(), buildingId]);
        saveDatabase();

        res.json({ success: true, finishTime: finishTime.toISOString() });
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ error: 'Failed to upgrade building' });
    }
});

app.post('/api/game/ships/build', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { shipTypeId, quantity } = req.body;

        if (quantity < 1) return res.status(400).json({ error: 'Invalid quantity' });

        const island = dbGet('SELECT * FROM islands WHERE user_id = ? AND is_main = 1', [userId]);
        if (!island) return res.status(404).json({ error: 'Island not found' });

        const shipType = dbGet('SELECT * FROM ship_types WHERE id = ?', [shipTypeId]);
        if (!shipType) return res.status(404).json({ error: 'Ship type not found' });

        const shipyard = dbGet(`
            SELECT b.level FROM buildings b JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ? AND bt.name = 'Shipyard'
        `, [island.id]);

        if (!shipyard || shipyard.level < shipType.required_shipyard_level) {
            return res.status(400).json({ error: `Requires Shipyard level ${shipType.required_shipyard_level}` });
        }

        const totalCost = {
            gold: shipType.gold_cost * quantity, rum: shipType.rum_cost * quantity,
            wood: shipType.wood_cost * quantity, iron: shipType.iron_cost * quantity
        };

        const resources = updateResources(island.id);
        if (resources.gold < totalCost.gold || resources.rum < totalCost.rum ||
            resources.wood < totalCost.wood || resources.iron < totalCost.iron) {
            return res.status(400).json({ error: 'Insufficient resources' });
        }

        dbRun(`UPDATE resources SET gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ? WHERE island_id = ?`,
            [totalCost.gold, totalCost.rum, totalCost.wood, totalCost.iron, island.id]);

        const buildTime = Math.floor(shipType.build_time * quantity);
        const lastInQueue = dbGet(`SELECT finish_time FROM ship_queue WHERE island_id = ? ORDER BY finish_time DESC LIMIT 1`, [island.id]);
        const startTime = lastInQueue ? new Date(lastInQueue.finish_time) : new Date();
        const finishTime = new Date(startTime.getTime() + buildTime * 1000);

        dbRun(`INSERT INTO ship_queue (island_id, ship_type_id, quantity, finish_time) VALUES (?, ?, ?, ?)`,
            [island.id, shipTypeId, quantity, finishTime.toISOString()]);
        saveDatabase();

        res.json({ success: true, finishTime: finishTime.toISOString() });
    } catch (error) {
        console.error('Build ship error:', error);
        res.status(500).json({ error: 'Failed to build ships' });
    }
});

app.post('/api/game/research/start', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { researchId } = req.body;

        const research = dbGet(`
            SELECT r.*, rt.name, rt.base_gold_cost, rt.base_rum_cost, rt.base_wood_cost, rt.base_iron_cost,
                   rt.base_research_time, rt.cost_factor, rt.time_factor, rt.required_academy_level
            FROM research r JOIN research_types rt ON r.research_type_id = rt.id
            WHERE r.id = ? AND r.user_id = ?
        `, [researchId, userId]);

        if (!research) return res.status(404).json({ error: 'Research not found' });
        if (research.is_researching) return res.status(400).json({ error: 'Research already in progress' });

        const ongoingResearch = dbGet(`SELECT * FROM research WHERE user_id = ? AND is_researching = 1`, [userId]);
        if (ongoingResearch) return res.status(400).json({ error: 'Another research is already in progress' });

        const island = dbGet('SELECT * FROM islands WHERE user_id = ? AND is_main = 1', [userId]);
        const academy = dbGet(`
            SELECT b.level FROM buildings b JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ? AND bt.name = 'Pirate Academy'
        `, [island.id]);

        if (!academy || academy.level < research.required_academy_level) {
            return res.status(400).json({ error: `Requires Pirate Academy level ${research.required_academy_level}` });
        }

        const cost = getResearchCost({
            base_gold_cost: research.base_gold_cost, base_rum_cost: research.base_rum_cost,
            base_wood_cost: research.base_wood_cost, base_iron_cost: research.base_iron_cost,
            base_research_time: research.base_research_time, cost_factor: research.cost_factor, time_factor: research.time_factor
        }, research.level);

        const resources = updateResources(island.id);
        if (resources.gold < cost.gold || resources.rum < cost.rum || resources.wood < cost.wood || resources.iron < cost.iron) {
            return res.status(400).json({ error: 'Insufficient resources' });
        }

        dbRun(`UPDATE resources SET gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ? WHERE island_id = ?`,
            [cost.gold, cost.rum, cost.wood, cost.iron, island.id]);

        const finishTime = new Date(Date.now() + cost.time * 1000);
        dbRun(`UPDATE research SET is_researching = 1, research_finish_time = ? WHERE id = ?`, [finishTime.toISOString(), researchId]);
        saveDatabase();

        res.json({ success: true, finishTime: finishTime.toISOString() });
    } catch (error) {
        console.error('Research error:', error);
        res.status(500).json({ error: 'Failed to start research' });
    }
});

app.post('/api/game/fleet/send', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { missionType, targetX, targetY, ships, cargo } = req.body;

        if (!['attack', 'transport', 'spy'].includes(missionType)) {
            return res.status(400).json({ error: 'Invalid mission type' });
        }

        const island = dbGet('SELECT * FROM islands WHERE user_id = ? AND is_main = 1', [userId]);
        if (!island) return res.status(404).json({ error: 'Island not found' });

        const totalShips = Object.values(ships).reduce((sum, qty) => sum + qty, 0);
        if (totalShips < 1) return res.status(400).json({ error: 'No ships selected' });

        for (const [shipTypeId, quantity] of Object.entries(ships)) {
            if (quantity > 0) {
                const playerShip = dbGet(`SELECT quantity FROM ships WHERE island_id = ? AND ship_type_id = ?`, [island.id, parseInt(shipTypeId)]);
                if (!playerShip || playerShip.quantity < quantity) {
                    return res.status(400).json({ error: 'Insufficient ships' });
                }
            }
        }

        let cargoCapacity = 0;
        let fleetSpeed = Infinity;

        for (const [shipTypeId, quantity] of Object.entries(ships)) {
            if (quantity > 0) {
                const shipType = dbGet('SELECT * FROM ship_types WHERE id = ?', [parseInt(shipTypeId)]);
                if (shipType) {
                    cargoCapacity += shipType.cargo_capacity * quantity;
                    fleetSpeed = Math.min(fleetSpeed, shipType.speed);
                }
            }
        }

        if (missionType === 'transport' && cargo) {
            const totalCargo = (cargo.gold || 0) + (cargo.rum || 0) + (cargo.wood || 0) + (cargo.iron || 0);
            if (totalCargo > cargoCapacity) return res.status(400).json({ error: 'Cargo exceeds capacity' });

            const resources = updateResources(island.id);
            if (resources.gold < (cargo.gold || 0) || resources.rum < (cargo.rum || 0) ||
                resources.wood < (cargo.wood || 0) || resources.iron < (cargo.iron || 0)) {
                return res.status(400).json({ error: 'Insufficient resources for cargo' });
            }

            dbRun(`UPDATE resources SET gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ? WHERE island_id = ?`,
                [cargo.gold || 0, cargo.rum || 0, cargo.wood || 0, cargo.iron || 0, island.id]);
        }

        const distance = Math.sqrt(Math.pow(targetX - island.x_coord, 2) + Math.pow(targetY - island.y_coord, 2));
        const travelTime = Math.max(60, Math.floor((distance / fleetSpeed) * 3600));

        for (const [shipTypeId, quantity] of Object.entries(ships)) {
            if (quantity > 0) {
                dbRun(`UPDATE ships SET quantity = quantity - ? WHERE island_id = ? AND ship_type_id = ?`,
                    [quantity, island.id, parseInt(shipTypeId)]);
            }
        }

        const targetIsland = dbGet(`SELECT * FROM islands WHERE x_coord = ? AND y_coord = ?`, [targetX, targetY]);
        const departureTime = new Date();
        const arrivalTime = new Date(Date.now() + travelTime * 1000);

        const result = dbRun(`
            INSERT INTO fleet_missions
            (user_id, origin_island_id, target_island_id, target_x, target_y, mission_type, ships_data,
             cargo_gold, cargo_rum, cargo_wood, cargo_iron, departure_time, arrival_time, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'traveling')
        `, [userId, island.id, targetIsland?.id || null, targetX, targetY, missionType,
            JSON.stringify(ships), cargo?.gold || 0, cargo?.rum || 0, cargo?.wood || 0, cargo?.iron || 0,
            departureTime.toISOString(), arrivalTime.toISOString()]);
        saveDatabase();

        res.json({ success: true, missionId: result.lastInsertRowid, arrivalTime: arrivalTime.toISOString(), travelTime });
    } catch (error) {
        console.error('Fleet send error:', error);
        res.status(500).json({ error: 'Failed to send fleet' });
    }
});

app.get('/api/game/reports', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const reports = dbAll(`
            SELECT br.*, u1.username as attacker_name, u2.username as defender_name
            FROM battle_reports br
            LEFT JOIN users u1 ON br.attacker_id = u1.id
            LEFT JOIN users u2 ON br.defender_id = u2.id
            WHERE br.attacker_id = ? OR br.defender_id = ?
            ORDER BY br.battle_time DESC LIMIT 50
        `, [userId, userId]);

        res.json({ reports });
    } catch (error) {
        console.error('Reports error:', error);
        res.status(500).json({ error: 'Failed to get reports' });
    }
});

app.get('/api/game/rankings', authenticateToken, (req, res) => {
    try {
        const rankings = dbAll(`
            SELECT s.*, u.username FROM scores s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.total_score DESC LIMIT 100
        `);
        res.json({ rankings });
    } catch (error) {
        console.error('Rankings error:', error);
        res.status(500).json({ error: 'Failed to get rankings' });
    }
});

app.get('/api/game/galaxy', authenticateToken, (req, res) => {
    try {
        const { minX = 1, maxX = 100, minY = 1, maxY = 100 } = req.query;
        const islands = dbAll(`
            SELECT i.id, i.name, i.x_coord, i.y_coord, u.username, s.total_score
            FROM islands i JOIN users u ON i.user_id = u.id
            LEFT JOIN scores s ON i.user_id = s.user_id
            WHERE i.x_coord BETWEEN ? AND ? AND i.y_coord BETWEEN ? AND ?
            ORDER BY i.x_coord, i.y_coord
        `, [minX, maxX, minY, maxY]);
        res.json({ islands });
    } catch (error) {
        console.error('Galaxy error:', error);
        res.status(500).json({ error: 'Failed to get galaxy view' });
    }
});

app.post('/api/game/island/rename', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { name } = req.body;

        if (!name || name.length > 30) return res.status(400).json({ error: 'Invalid name' });

        dbRun(`UPDATE islands SET name = ? WHERE user_id = ? AND is_main = 1`, [name, userId]);
        saveDatabase();
        res.json({ success: true });
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ error: 'Failed to rename island' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Start server
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Pirate Game server running on http://localhost:${PORT}`);
    });
});

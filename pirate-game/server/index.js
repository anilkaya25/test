const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pirate-secret-key-change-in-production';

// Database connection
const dbPath = path.join(__dirname, '..', 'database', 'pirate_game.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

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

// Update resources based on time passed
function updateResources(islandId) {
    const island = db.prepare('SELECT * FROM islands WHERE id = ?').get(islandId);
    if (!island) return null;

    const resources = db.prepare('SELECT * FROM resources WHERE island_id = ?').get(islandId);
    if (!resources) return null;

    const now = new Date();
    const lastUpdate = new Date(resources.last_update);
    const hoursPassed = (now - lastUpdate) / (1000 * 60 * 60);

    if (hoursPassed <= 0) return resources;

    // Get production rates from buildings
    const buildings = db.prepare(`
        SELECT b.level, bt.effect_type, bt.effect_value
        FROM buildings b
        JOIN building_types bt ON b.building_type_id = bt.id
        WHERE b.island_id = ? AND b.level > 0
    `).all(islandId);

    let goldProduction = 20; // Base production
    let rumProduction = 10;
    let woodProduction = 15;
    let ironProduction = 5;
    let storageCapacity = 10000; // Base storage

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

    // Get research bonuses
    const research = db.prepare(`
        SELECT r.level, rt.effect_type, rt.effect_value
        FROM research r
        JOIN research_types rt ON r.research_type_id = rt.id
        WHERE r.user_id = ? AND r.level > 0
    `).all(island.user_id);

    let productionBonus = 1;
    for (const tech of research) {
        if (tech.effect_type === 'production_bonus') {
            productionBonus += tech.effect_value * tech.level;
        }
    }

    // Calculate new resources
    let newGold = Math.min(resources.gold + (goldProduction * hoursPassed * productionBonus), storageCapacity);
    let newRum = Math.min(resources.rum + (rumProduction * hoursPassed * productionBonus), storageCapacity);
    let newWood = Math.min(resources.wood + (woodProduction * hoursPassed * productionBonus), storageCapacity);
    let newIron = Math.min(resources.iron + (ironProduction * hoursPassed * productionBonus), storageCapacity);

    // Update database
    db.prepare(`
        UPDATE resources SET gold = ?, rum = ?, wood = ?, iron = ?, last_update = ? WHERE island_id = ?
    `).run(newGold, newRum, newWood, newIron, now.toISOString(), islandId);

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

// Process completed building upgrades
function processBuildings(islandId) {
    const now = new Date().toISOString();

    // Find completed upgrades
    const completedUpgrades = db.prepare(`
        SELECT * FROM buildings
        WHERE island_id = ? AND is_upgrading = 1 AND upgrade_finish_time <= ?
    `).all(islandId, now);

    for (const building of completedUpgrades) {
        db.prepare(`
            UPDATE buildings SET level = level + 1, is_upgrading = 0, upgrade_finish_time = NULL
            WHERE id = ?
        `).run(building.id);
    }
}

// Process completed ship builds
function processShipQueue(islandId) {
    const now = new Date().toISOString();

    const completedShips = db.prepare(`
        SELECT * FROM ship_queue WHERE island_id = ? AND finish_time <= ?
    `).all(islandId, now);

    for (const queue of completedShips) {
        // Add ships to inventory
        db.prepare(`
            INSERT INTO ships (island_id, ship_type_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(island_id, ship_type_id)
            DO UPDATE SET quantity = quantity + ?
        `).run(islandId, queue.ship_type_id, queue.quantity, queue.quantity);

        // Remove from queue
        db.prepare('DELETE FROM ship_queue WHERE id = ?').run(queue.id);
    }
}

// Process completed research
function processResearch(userId) {
    const now = new Date().toISOString();

    const completedResearch = db.prepare(`
        SELECT * FROM research
        WHERE user_id = ? AND is_researching = 1 AND research_finish_time <= ?
    `).all(userId, now);

    for (const research of completedResearch) {
        db.prepare(`
            UPDATE research SET level = level + 1, is_researching = 0, research_finish_time = NULL
            WHERE id = ?
        `).run(research.id);
    }
}

// Process fleet missions
function processFleetMissions() {
    const now = new Date().toISOString();

    // Handle arrived missions
    const arrivedMissions = db.prepare(`
        SELECT * FROM fleet_missions WHERE status = 'traveling' AND arrival_time <= ?
    `).all(now);

    for (const mission of arrivedMissions) {
        switch (mission.mission_type) {
            case 'attack':
                processBattle(mission);
                break;
            case 'transport':
                processTransport(mission);
                break;
            case 'spy':
                processSpy(mission);
                break;
        }
    }

    // Handle returning fleets
    const returningMissions = db.prepare(`
        SELECT * FROM fleet_missions WHERE status = 'returning' AND return_time <= ?
    `).all(now);

    for (const mission of returningMissions) {
        returnFleet(mission);
    }
}

function processBattle(mission) {
    const ships = JSON.parse(mission.ships_data);
    let targetIsland = null;
    let defenderId = null;

    if (mission.target_island_id) {
        targetIsland = db.prepare('SELECT * FROM islands WHERE id = ?').get(mission.target_island_id);
        if (targetIsland) defenderId = targetIsland.user_id;
    }

    // Get attacker research bonuses
    const attackerResearch = db.prepare(`
        SELECT r.level, rt.effect_type, rt.effect_value
        FROM research r
        JOIN research_types rt ON r.research_type_id = rt.id
        WHERE r.user_id = ? AND r.level > 0
    `).all(mission.user_id);

    let attackBonus = 1;
    let lootBonus = 1;
    for (const tech of attackerResearch) {
        if (tech.effect_type === 'attack_bonus') attackBonus += tech.effect_value * tech.level;
        if (tech.effect_type === 'loot_bonus') lootBonus += tech.effect_value * tech.level;
    }

    // Calculate attacker power
    let attackPower = 0;
    let attackerCargoCapacity = 0;
    for (const [shipTypeId, quantity] of Object.entries(ships)) {
        const shipType = db.prepare('SELECT * FROM ship_types WHERE id = ?').get(parseInt(shipTypeId));
        if (shipType) {
            attackPower += shipType.attack_power * quantity * attackBonus;
            attackerCargoCapacity += shipType.cargo_capacity * quantity;
        }
    }

    // Calculate defender power
    let defensePower = 0;
    let defenderShips = {};

    if (targetIsland) {
        const defenderResearch = db.prepare(`
            SELECT r.level, rt.effect_type, rt.effect_value
            FROM research r
            JOIN research_types rt ON r.research_type_id = rt.id
            WHERE r.user_id = ? AND r.level > 0
        `).all(targetIsland.user_id);

        let defenseBonus = 1;
        for (const tech of defenderResearch) {
            if (tech.effect_type === 'defense_bonus') defenseBonus += tech.effect_value * tech.level;
        }

        // Get defender buildings defense bonus
        const defenderBuildings = db.prepare(`
            SELECT b.level, bt.effect_type, bt.effect_value
            FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ? AND bt.effect_type = 'defense_bonus' AND b.level > 0
        `).all(targetIsland.id);

        for (const building of defenderBuildings) {
            defenseBonus += building.effect_value * building.level;
        }

        const islandShips = db.prepare(`
            SELECT s.*, st.defense_power, st.name FROM ships s
            JOIN ship_types st ON s.ship_type_id = st.id
            WHERE s.island_id = ? AND s.quantity > 0
        `).all(targetIsland.id);

        for (const ship of islandShips) {
            defensePower += ship.defense_power * ship.quantity * defenseBonus;
            defenderShips[ship.ship_type_id] = ship.quantity;
        }
    }

    // Battle simulation
    const attackerWins = attackPower > defensePower;
    const battleRatio = attackerWins ?
        (defensePower > 0 ? defensePower / attackPower : 0) :
        (attackPower / (defensePower || 1));

    // Calculate losses
    let attackerLosses = {};
    let defenderLosses = {};
    let loot = { gold: 0, rum: 0, wood: 0, iron: 0 };

    const lossPercent = attackerWins ? battleRatio * 0.7 : Math.min(0.9, battleRatio + 0.3);

    // Attacker losses
    let remainingShips = {};
    for (const [shipTypeId, quantity] of Object.entries(ships)) {
        const losses = Math.floor(quantity * lossPercent);
        attackerLosses[shipTypeId] = losses;
        remainingShips[shipTypeId] = quantity - losses;
    }

    // Defender losses and loot
    if (targetIsland && attackerWins) {
        // Defender loses all ships
        for (const [shipTypeId, quantity] of Object.entries(defenderShips)) {
            defenderLosses[shipTypeId] = quantity;
            db.prepare('UPDATE ships SET quantity = 0 WHERE island_id = ? AND ship_type_id = ?')
                .run(targetIsland.id, parseInt(shipTypeId));
        }

        // Loot resources
        updateResources(targetIsland.id);
        const targetResources = db.prepare('SELECT * FROM resources WHERE island_id = ?').get(targetIsland.id);

        if (targetResources) {
            // Can loot up to 50% of resources, limited by cargo capacity
            const lootableGold = targetResources.gold * 0.5 * lootBonus;
            const lootableRum = targetResources.rum * 0.5 * lootBonus;
            const lootableWood = targetResources.wood * 0.5 * lootBonus;
            const lootableIron = targetResources.iron * 0.5 * lootBonus;

            const totalLootable = lootableGold + lootableRum + lootableWood + lootableIron;
            const lootRatio = Math.min(1, attackerCargoCapacity / (totalLootable || 1));

            loot.gold = Math.floor(lootableGold * lootRatio);
            loot.rum = Math.floor(lootableRum * lootRatio);
            loot.wood = Math.floor(lootableWood * lootRatio);
            loot.iron = Math.floor(lootableIron * lootRatio);

            // Remove looted resources from target
            db.prepare(`
                UPDATE resources SET
                    gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ?
                WHERE island_id = ?
            `).run(loot.gold, loot.rum, loot.wood, loot.iron, targetIsland.id);
        }
    }

    // Create battle report
    db.prepare(`
        INSERT INTO battle_reports
        (attacker_id, defender_id, target_x, target_y, attacker_ships, defender_ships,
         attacker_losses, defender_losses, loot_gold, loot_rum, loot_wood, loot_iron, winner)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        mission.user_id,
        defenderId,
        mission.target_x,
        mission.target_y,
        JSON.stringify(ships),
        JSON.stringify(defenderShips),
        JSON.stringify(attackerLosses),
        JSON.stringify(defenderLosses),
        loot.gold, loot.rum, loot.wood, loot.iron,
        attackerWins ? 'attacker' : 'defender'
    );

    // Update mission for return
    const returnTime = new Date(Date.now() + (new Date(mission.arrival_time) - new Date(mission.departure_time)));

    db.prepare(`
        UPDATE fleet_missions SET
            status = 'returning',
            ships_data = ?,
            cargo_gold = ?, cargo_rum = ?, cargo_wood = ?, cargo_iron = ?,
            return_time = ?
        WHERE id = ?
    `).run(
        JSON.stringify(remainingShips),
        loot.gold, loot.rum, loot.wood, loot.iron,
        returnTime.toISOString(),
        mission.id
    );
}

function processTransport(mission) {
    if (!mission.target_island_id) return;

    // Deliver resources
    db.prepare(`
        UPDATE resources SET
            gold = gold + ?, rum = rum + ?, wood = wood + ?, iron = iron + ?
        WHERE island_id = ?
    `).run(mission.cargo_gold, mission.cargo_rum, mission.cargo_wood, mission.cargo_iron, mission.target_island_id);

    // Set up return
    const returnTime = new Date(Date.now() + (new Date(mission.arrival_time) - new Date(mission.departure_time)));

    db.prepare(`
        UPDATE fleet_missions SET
            status = 'returning',
            cargo_gold = 0, cargo_rum = 0, cargo_wood = 0, cargo_iron = 0,
            return_time = ?
        WHERE id = ?
    `).run(returnTime.toISOString(), mission.id);
}

function processSpy(mission) {
    // For now, just set up return
    const returnTime = new Date(Date.now() + (new Date(mission.arrival_time) - new Date(mission.departure_time)));

    db.prepare(`
        UPDATE fleet_missions SET status = 'returning', return_time = ?
        WHERE id = ?
    `).run(returnTime.toISOString(), mission.id);
}

function returnFleet(mission) {
    const ships = JSON.parse(mission.ships_data);

    // Return ships to island
    for (const [shipTypeId, quantity] of Object.entries(ships)) {
        if (quantity > 0) {
            db.prepare(`
                INSERT INTO ships (island_id, ship_type_id, quantity)
                VALUES (?, ?, ?)
                ON CONFLICT(island_id, ship_type_id)
                DO UPDATE SET quantity = quantity + ?
            `).run(mission.origin_island_id, parseInt(shipTypeId), quantity, quantity);
        }
    }

    // Return cargo
    if (mission.cargo_gold > 0 || mission.cargo_rum > 0 || mission.cargo_wood > 0 || mission.cargo_iron > 0) {
        db.prepare(`
            UPDATE resources SET
                gold = gold + ?, rum = rum + ?, wood = wood + ?, iron = iron + ?
            WHERE island_id = ?
        `).run(mission.cargo_gold, mission.cargo_rum, mission.cargo_wood, mission.cargo_iron, mission.origin_island_id);
    }

    // Delete mission
    db.prepare('DELETE FROM fleet_missions WHERE id = ?').run(mission.id);
}

// Calculate building cost/time
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

// Calculate research cost/time
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

// Update player score
function updateScore(userId) {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return;

    // Building score
    const buildingScore = db.prepare(`
        SELECT COALESCE(SUM(b.level * 100), 0) as score
        FROM buildings b
        JOIN islands i ON b.island_id = i.id
        WHERE i.user_id = ?
    `).get(userId).score;

    // Research score
    const researchScore = db.prepare(`
        SELECT COALESCE(SUM(level * 200), 0) as score FROM research WHERE user_id = ?
    `).get(userId).score;

    // Fleet score
    const fleetScore = db.prepare(`
        SELECT COALESCE(SUM(s.quantity * st.attack_power), 0) as score
        FROM ships s
        JOIN ship_types st ON s.ship_type_id = st.id
        JOIN islands i ON s.island_id = i.id
        WHERE i.user_id = ?
    `).get(userId).score;

    const totalScore = buildingScore + researchScore + fleetScore;

    db.prepare(`
        INSERT INTO scores (user_id, total_score, building_score, research_score, fleet_score, last_update)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            total_score = ?, building_score = ?, research_score = ?, fleet_score = ?, last_update = CURRENT_TIMESTAMP
    `).run(userId, totalScore, buildingScore, researchScore, fleetScore,
           totalScore, buildingScore, researchScore, fleetScore);
}

// =====================
// API ROUTES
// =====================

// Auth routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Check if user exists
        const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const result = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, passwordHash);
        const userId = result.lastInsertRowid;

        // Generate random coordinates for island
        const x = Math.floor(Math.random() * 500) + 1;
        const y = Math.floor(Math.random() * 500) + 1;

        // Create main island
        const islandResult = db.prepare('INSERT INTO islands (user_id, name, x_coord, y_coord) VALUES (?, ?, ?, ?)').run(userId, 'Tortuga', x, y);
        const islandId = islandResult.lastInsertRowid;

        // Create resources
        db.prepare('INSERT INTO resources (island_id) VALUES (?)').run(islandId);

        // Initialize buildings at level 0
        const buildingTypes = db.prepare('SELECT id FROM building_types').all();
        for (const bt of buildingTypes) {
            db.prepare('INSERT INTO buildings (island_id, building_type_id) VALUES (?, ?)').run(islandId, bt.id);
        }

        // Initialize ships at 0
        const shipTypes = db.prepare('SELECT id FROM ship_types').all();
        for (const st of shipTypes) {
            db.prepare('INSERT INTO ships (island_id, ship_type_id) VALUES (?, ?)').run(islandId, st.id);
        }

        // Initialize research at level 0
        const researchTypes = db.prepare('SELECT id FROM research_types').all();
        for (const rt of researchTypes) {
            db.prepare('INSERT INTO research (user_id, research_type_id) VALUES (?, ?)').run(userId, rt.id);
        }

        // Initialize score
        db.prepare('INSERT INTO scores (user_id) VALUES (?)').run(userId);

        // Generate token
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

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Update last login
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Game data routes
app.get('/api/game/overview', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;

        // Process any pending operations
        const islands = db.prepare('SELECT * FROM islands WHERE user_id = ?').all(userId);
        for (const island of islands) {
            processBuildings(island.id);
            processShipQueue(island.id);
        }
        processResearch(userId);
        processFleetMissions();

        const mainIsland = islands.find(i => i.is_main) || islands[0];
        if (!mainIsland) {
            return res.status(404).json({ error: 'No island found' });
        }

        const resources = updateResources(mainIsland.id);

        // Get buildings
        const buildings = db.prepare(`
            SELECT b.*, bt.name, bt.description, bt.effect_type, bt.effect_value,
                   bt.base_gold_cost, bt.base_rum_cost, bt.base_wood_cost, bt.base_iron_cost,
                   bt.base_build_time, bt.cost_factor, bt.time_factor
            FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ?
            ORDER BY bt.id
        `).all(mainIsland.id);

        // Calculate next level costs for buildings
        const buildingsWithCosts = buildings.map(b => ({
            ...b,
            nextLevelCost: getBuildingCost({
                base_gold_cost: b.base_gold_cost,
                base_rum_cost: b.base_rum_cost,
                base_wood_cost: b.base_wood_cost,
                base_iron_cost: b.base_iron_cost,
                base_build_time: b.base_build_time,
                cost_factor: b.cost_factor,
                time_factor: b.time_factor
            }, b.level)
        }));

        // Get ships
        const ships = db.prepare(`
            SELECT s.*, st.name, st.description, st.gold_cost, st.rum_cost, st.wood_cost, st.iron_cost,
                   st.build_time, st.attack_power, st.defense_power, st.cargo_capacity, st.speed, st.required_shipyard_level
            FROM ships s
            JOIN ship_types st ON s.ship_type_id = st.id
            WHERE s.island_id = ?
            ORDER BY st.id
        `).all(mainIsland.id);

        // Get ship queue
        const shipQueue = db.prepare(`
            SELECT sq.*, st.name FROM ship_queue sq
            JOIN ship_types st ON sq.ship_type_id = st.id
            WHERE sq.island_id = ?
            ORDER BY sq.finish_time
        `).all(mainIsland.id);

        // Get research
        const research = db.prepare(`
            SELECT r.*, rt.name, rt.description, rt.effect_type, rt.effect_value,
                   rt.base_gold_cost, rt.base_rum_cost, rt.base_wood_cost, rt.base_iron_cost,
                   rt.base_research_time, rt.cost_factor, rt.time_factor, rt.required_academy_level
            FROM research r
            JOIN research_types rt ON r.research_type_id = rt.id
            WHERE r.user_id = ?
            ORDER BY rt.id
        `).all(userId);

        // Calculate next level costs for research
        const researchWithCosts = research.map(r => ({
            ...r,
            nextLevelCost: getResearchCost({
                base_gold_cost: r.base_gold_cost,
                base_rum_cost: r.base_rum_cost,
                base_wood_cost: r.base_wood_cost,
                base_iron_cost: r.base_iron_cost,
                base_research_time: r.base_research_time,
                cost_factor: r.cost_factor,
                time_factor: r.time_factor
            }, r.level)
        }));

        // Get active missions
        const missions = db.prepare(`
            SELECT fm.*, i.name as target_name FROM fleet_missions fm
            LEFT JOIN islands i ON fm.target_island_id = i.id
            WHERE fm.user_id = ?
            ORDER BY fm.arrival_time
        `).all(userId);

        // Get score
        updateScore(userId);
        const score = db.prepare('SELECT * FROM scores WHERE user_id = ?').get(userId);

        // Get shipyard level for ship requirements
        const shipyard = buildings.find(b => b.name === 'Shipyard');
        const academy = buildings.find(b => b.name === 'Pirate Academy');

        res.json({
            island: mainIsland,
            resources,
            buildings: buildingsWithCosts,
            ships,
            shipQueue,
            research: researchWithCosts,
            missions,
            score,
            shipyardLevel: shipyard?.level || 0,
            academyLevel: academy?.level || 0
        });
    } catch (error) {
        console.error('Overview error:', error);
        res.status(500).json({ error: 'Failed to get overview' });
    }
});

// Upgrade building
app.post('/api/game/buildings/upgrade', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { buildingId } = req.body;

        // Get building
        const building = db.prepare(`
            SELECT b.*, bt.name, bt.base_gold_cost, bt.base_rum_cost, bt.base_wood_cost, bt.base_iron_cost,
                   bt.base_build_time, bt.cost_factor, bt.time_factor, i.id as island_id
            FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            JOIN islands i ON b.island_id = i.id
            WHERE b.id = ? AND i.user_id = ?
        `).get(buildingId, userId);

        if (!building) {
            return res.status(404).json({ error: 'Building not found' });
        }

        if (building.is_upgrading) {
            return res.status(400).json({ error: 'Building is already upgrading' });
        }

        // Check if another building is upgrading
        const upgradingBuilding = db.prepare(`
            SELECT * FROM buildings WHERE island_id = ? AND is_upgrading = 1
        `).get(building.island_id);

        if (upgradingBuilding) {
            return res.status(400).json({ error: 'Another building is already upgrading' });
        }

        // Calculate cost
        const cost = getBuildingCost({
            base_gold_cost: building.base_gold_cost,
            base_rum_cost: building.base_rum_cost,
            base_wood_cost: building.base_wood_cost,
            base_iron_cost: building.base_iron_cost,
            base_build_time: building.base_build_time,
            cost_factor: building.cost_factor,
            time_factor: building.time_factor
        }, building.level);

        // Update and check resources
        const resources = updateResources(building.island_id);

        if (resources.gold < cost.gold || resources.rum < cost.rum ||
            resources.wood < cost.wood || resources.iron < cost.iron) {
            return res.status(400).json({ error: 'Insufficient resources' });
        }

        // Deduct resources
        db.prepare(`
            UPDATE resources SET gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ?
            WHERE island_id = ?
        `).run(cost.gold, cost.rum, cost.wood, cost.iron, building.island_id);

        // Start upgrade
        const finishTime = new Date(Date.now() + cost.time * 1000);
        db.prepare(`
            UPDATE buildings SET is_upgrading = 1, upgrade_finish_time = ? WHERE id = ?
        `).run(finishTime.toISOString(), buildingId);

        res.json({ success: true, finishTime: finishTime.toISOString() });
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ error: 'Failed to upgrade building' });
    }
});

// Build ships
app.post('/api/game/ships/build', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { shipTypeId, quantity } = req.body;

        if (quantity < 1) {
            return res.status(400).json({ error: 'Invalid quantity' });
        }

        // Get main island
        const island = db.prepare('SELECT * FROM islands WHERE user_id = ? AND is_main = 1').get(userId);
        if (!island) {
            return res.status(404).json({ error: 'Island not found' });
        }

        // Get ship type
        const shipType = db.prepare('SELECT * FROM ship_types WHERE id = ?').get(shipTypeId);
        if (!shipType) {
            return res.status(404).json({ error: 'Ship type not found' });
        }

        // Check shipyard level
        const shipyard = db.prepare(`
            SELECT b.level FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ? AND bt.name = 'Shipyard'
        `).get(island.id);

        if (!shipyard || shipyard.level < shipType.required_shipyard_level) {
            return res.status(400).json({ error: `Requires Shipyard level ${shipType.required_shipyard_level}` });
        }

        // Calculate total cost
        const totalCost = {
            gold: shipType.gold_cost * quantity,
            rum: shipType.rum_cost * quantity,
            wood: shipType.wood_cost * quantity,
            iron: shipType.iron_cost * quantity
        };

        // Check resources
        const resources = updateResources(island.id);

        if (resources.gold < totalCost.gold || resources.rum < totalCost.rum ||
            resources.wood < totalCost.wood || resources.iron < totalCost.iron) {
            return res.status(400).json({ error: 'Insufficient resources' });
        }

        // Deduct resources
        db.prepare(`
            UPDATE resources SET gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ?
            WHERE island_id = ?
        `).run(totalCost.gold, totalCost.rum, totalCost.wood, totalCost.iron, island.id);

        // Get build speed bonus
        const buildSpeedBonus = db.prepare(`
            SELECT b.level, bt.effect_value FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ? AND bt.effect_type = 'ship_build_speed'
        `).get(island.id);

        let speedMultiplier = 1;
        if (buildSpeedBonus && buildSpeedBonus.level > 0) {
            speedMultiplier = 1 - (buildSpeedBonus.effect_value * buildSpeedBonus.level);
        }

        // Get research bonus
        const researchBonus = db.prepare(`
            SELECT r.level, rt.effect_value FROM research r
            JOIN research_types rt ON r.research_type_id = rt.id
            WHERE r.user_id = ? AND rt.effect_type = 'build_speed' AND r.level > 0
        `).get(userId);

        if (researchBonus) {
            speedMultiplier -= researchBonus.effect_value * researchBonus.level;
        }

        speedMultiplier = Math.max(0.2, speedMultiplier); // Minimum 20% of original time

        // Calculate build time
        const buildTime = Math.floor(shipType.build_time * quantity * speedMultiplier);

        // Check existing queue
        const lastInQueue = db.prepare(`
            SELECT finish_time FROM ship_queue WHERE island_id = ? ORDER BY finish_time DESC LIMIT 1
        `).get(island.id);

        const startTime = lastInQueue ? new Date(lastInQueue.finish_time) : new Date();
        const finishTime = new Date(startTime.getTime() + buildTime * 1000);

        // Add to queue
        db.prepare(`
            INSERT INTO ship_queue (island_id, ship_type_id, quantity, finish_time) VALUES (?, ?, ?, ?)
        `).run(island.id, shipTypeId, quantity, finishTime.toISOString());

        res.json({ success: true, finishTime: finishTime.toISOString() });
    } catch (error) {
        console.error('Build ship error:', error);
        res.status(500).json({ error: 'Failed to build ships' });
    }
});

// Start research
app.post('/api/game/research/start', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { researchId } = req.body;

        // Get research
        const research = db.prepare(`
            SELECT r.*, rt.name, rt.base_gold_cost, rt.base_rum_cost, rt.base_wood_cost, rt.base_iron_cost,
                   rt.base_research_time, rt.cost_factor, rt.time_factor, rt.required_academy_level
            FROM research r
            JOIN research_types rt ON r.research_type_id = rt.id
            WHERE r.id = ? AND r.user_id = ?
        `).get(researchId, userId);

        if (!research) {
            return res.status(404).json({ error: 'Research not found' });
        }

        if (research.is_researching) {
            return res.status(400).json({ error: 'Research already in progress' });
        }

        // Check if any research is in progress
        const ongoingResearch = db.prepare(`
            SELECT * FROM research WHERE user_id = ? AND is_researching = 1
        `).get(userId);

        if (ongoingResearch) {
            return res.status(400).json({ error: 'Another research is already in progress' });
        }

        // Check academy level
        const island = db.prepare('SELECT * FROM islands WHERE user_id = ? AND is_main = 1').get(userId);
        const academy = db.prepare(`
            SELECT b.level FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ? AND bt.name = 'Pirate Academy'
        `).get(island.id);

        if (!academy || academy.level < research.required_academy_level) {
            return res.status(400).json({ error: `Requires Pirate Academy level ${research.required_academy_level}` });
        }

        // Calculate cost
        const cost = getResearchCost({
            base_gold_cost: research.base_gold_cost,
            base_rum_cost: research.base_rum_cost,
            base_wood_cost: research.base_wood_cost,
            base_iron_cost: research.base_iron_cost,
            base_research_time: research.base_research_time,
            cost_factor: research.cost_factor,
            time_factor: research.time_factor
        }, research.level);

        // Check resources
        const resources = updateResources(island.id);

        if (resources.gold < cost.gold || resources.rum < cost.rum ||
            resources.wood < cost.wood || resources.iron < cost.iron) {
            return res.status(400).json({ error: 'Insufficient resources' });
        }

        // Deduct resources
        db.prepare(`
            UPDATE resources SET gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ?
            WHERE island_id = ?
        `).run(cost.gold, cost.rum, cost.wood, cost.iron, island.id);

        // Get research speed bonus
        const researchSpeedBonus = db.prepare(`
            SELECT b.level, bt.effect_value FROM buildings b
            JOIN building_types bt ON b.building_type_id = bt.id
            WHERE b.island_id = ? AND bt.effect_type = 'research_speed'
        `).get(island.id);

        let speedMultiplier = 1;
        if (researchSpeedBonus && researchSpeedBonus.level > 0) {
            speedMultiplier = 1 - (researchSpeedBonus.effect_value * researchSpeedBonus.level);
        }

        speedMultiplier = Math.max(0.2, speedMultiplier);

        // Start research
        const researchTime = Math.floor(cost.time * speedMultiplier);
        const finishTime = new Date(Date.now() + researchTime * 1000);

        db.prepare(`
            UPDATE research SET is_researching = 1, research_finish_time = ? WHERE id = ?
        `).run(finishTime.toISOString(), researchId);

        res.json({ success: true, finishTime: finishTime.toISOString() });
    } catch (error) {
        console.error('Research error:', error);
        res.status(500).json({ error: 'Failed to start research' });
    }
});

// Send fleet mission
app.post('/api/game/fleet/send', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { missionType, targetX, targetY, ships, cargo } = req.body;

        if (!['attack', 'transport', 'spy'].includes(missionType)) {
            return res.status(400).json({ error: 'Invalid mission type' });
        }

        // Get main island
        const island = db.prepare('SELECT * FROM islands WHERE user_id = ? AND is_main = 1').get(userId);
        if (!island) {
            return res.status(404).json({ error: 'Island not found' });
        }

        // Check if any ships are selected
        const totalShips = Object.values(ships).reduce((sum, qty) => sum + qty, 0);
        if (totalShips < 1) {
            return res.status(400).json({ error: 'No ships selected' });
        }

        // Check if player has enough ships
        for (const [shipTypeId, quantity] of Object.entries(ships)) {
            if (quantity > 0) {
                const playerShip = db.prepare(`
                    SELECT quantity FROM ships WHERE island_id = ? AND ship_type_id = ?
                `).get(island.id, parseInt(shipTypeId));

                if (!playerShip || playerShip.quantity < quantity) {
                    return res.status(400).json({ error: 'Insufficient ships' });
                }
            }
        }

        // Calculate cargo capacity
        let cargoCapacity = 0;
        let fleetSpeed = Infinity;

        for (const [shipTypeId, quantity] of Object.entries(ships)) {
            if (quantity > 0) {
                const shipType = db.prepare('SELECT * FROM ship_types WHERE id = ?').get(parseInt(shipTypeId));
                if (shipType) {
                    cargoCapacity += shipType.cargo_capacity * quantity;
                    fleetSpeed = Math.min(fleetSpeed, shipType.speed);
                }
            }
        }

        // Check cargo if transport mission
        if (missionType === 'transport' && cargo) {
            const totalCargo = (cargo.gold || 0) + (cargo.rum || 0) + (cargo.wood || 0) + (cargo.iron || 0);
            if (totalCargo > cargoCapacity) {
                return res.status(400).json({ error: 'Cargo exceeds capacity' });
            }

            // Check resources
            const resources = updateResources(island.id);
            if (resources.gold < (cargo.gold || 0) || resources.rum < (cargo.rum || 0) ||
                resources.wood < (cargo.wood || 0) || resources.iron < (cargo.iron || 0)) {
                return res.status(400).json({ error: 'Insufficient resources for cargo' });
            }

            // Deduct resources
            db.prepare(`
                UPDATE resources SET gold = gold - ?, rum = rum - ?, wood = wood - ?, iron = iron - ?
                WHERE island_id = ?
            `).run(cargo.gold || 0, cargo.rum || 0, cargo.wood || 0, cargo.iron || 0, island.id);
        }

        // Get speed bonus from research
        const speedResearch = db.prepare(`
            SELECT r.level, rt.effect_value FROM research r
            JOIN research_types rt ON r.research_type_id = rt.id
            WHERE r.user_id = ? AND rt.effect_type = 'fleet_speed' AND r.level > 0
        `).get(userId);

        if (speedResearch) {
            fleetSpeed *= (1 + speedResearch.effect_value * speedResearch.level);
        }

        // Calculate distance and travel time
        const distance = Math.sqrt(Math.pow(targetX - island.x_coord, 2) + Math.pow(targetY - island.y_coord, 2));
        const travelTime = Math.max(60, Math.floor((distance / fleetSpeed) * 3600)); // Minimum 1 minute

        // Remove ships from island
        for (const [shipTypeId, quantity] of Object.entries(ships)) {
            if (quantity > 0) {
                db.prepare(`
                    UPDATE ships SET quantity = quantity - ? WHERE island_id = ? AND ship_type_id = ?
                `).run(quantity, island.id, parseInt(shipTypeId));
            }
        }

        // Find target island if exists
        const targetIsland = db.prepare(`
            SELECT * FROM islands WHERE x_coord = ? AND y_coord = ?
        `).get(targetX, targetY);

        // Create mission
        const departureTime = new Date();
        const arrivalTime = new Date(Date.now() + travelTime * 1000);

        const result = db.prepare(`
            INSERT INTO fleet_missions
            (user_id, origin_island_id, target_island_id, target_x, target_y, mission_type, ships_data,
             cargo_gold, cargo_rum, cargo_wood, cargo_iron, departure_time, arrival_time, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'traveling')
        `).run(
            userId, island.id, targetIsland?.id || null, targetX, targetY, missionType,
            JSON.stringify(ships),
            cargo?.gold || 0, cargo?.rum || 0, cargo?.wood || 0, cargo?.iron || 0,
            departureTime.toISOString(), arrivalTime.toISOString()
        );

        res.json({
            success: true,
            missionId: result.lastInsertRowid,
            arrivalTime: arrivalTime.toISOString(),
            travelTime
        });
    } catch (error) {
        console.error('Fleet send error:', error);
        res.status(500).json({ error: 'Failed to send fleet' });
    }
});

// Get battle reports
app.get('/api/game/reports', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;

        const reports = db.prepare(`
            SELECT br.*,
                   u1.username as attacker_name,
                   u2.username as defender_name
            FROM battle_reports br
            LEFT JOIN users u1 ON br.attacker_id = u1.id
            LEFT JOIN users u2 ON br.defender_id = u2.id
            WHERE br.attacker_id = ? OR br.defender_id = ?
            ORDER BY br.battle_time DESC
            LIMIT 50
        `).all(userId, userId);

        // Mark as read
        db.prepare(`UPDATE battle_reports SET is_read_attacker = 1 WHERE attacker_id = ?`).run(userId);
        db.prepare(`UPDATE battle_reports SET is_read_defender = 1 WHERE defender_id = ?`).run(userId);

        res.json({ reports });
    } catch (error) {
        console.error('Reports error:', error);
        res.status(500).json({ error: 'Failed to get reports' });
    }
});

// Get rankings
app.get('/api/game/rankings', authenticateToken, (req, res) => {
    try {
        const rankings = db.prepare(`
            SELECT s.*, u.username
            FROM scores s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.total_score DESC
            LIMIT 100
        `).all();

        res.json({ rankings });
    } catch (error) {
        console.error('Rankings error:', error);
        res.status(500).json({ error: 'Failed to get rankings' });
    }
});

// Galaxy view - get islands in range
app.get('/api/game/galaxy', authenticateToken, (req, res) => {
    try {
        const { minX = 1, maxX = 100, minY = 1, maxY = 100 } = req.query;

        const islands = db.prepare(`
            SELECT i.id, i.name, i.x_coord, i.y_coord, u.username, s.total_score
            FROM islands i
            JOIN users u ON i.user_id = u.id
            LEFT JOIN scores s ON i.user_id = s.user_id
            WHERE i.x_coord BETWEEN ? AND ? AND i.y_coord BETWEEN ? AND ?
            ORDER BY i.x_coord, i.y_coord
        `).all(minX, maxX, minY, maxY);

        res.json({ islands });
    } catch (error) {
        console.error('Galaxy error:', error);
        res.status(500).json({ error: 'Failed to get galaxy view' });
    }
});

// Rename island
app.post('/api/game/island/rename', authenticateToken, (req, res) => {
    try {
        const userId = req.user.id;
        const { name } = req.body;

        if (!name || name.length > 30) {
            return res.status(400).json({ error: 'Invalid name' });
        }

        db.prepare(`
            UPDATE islands SET name = ? WHERE user_id = ? AND is_main = 1
        `).run(name, userId);

        res.json({ success: true });
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ error: 'Failed to rename island' });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Catch-all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Pirate Game server running on http://localhost:${PORT}`);
});

// Periodic task processor
setInterval(() => {
    try {
        processFleetMissions();
    } catch (error) {
        console.error('Periodic task error:', error);
    }
}, 30000); // Every 30 seconds

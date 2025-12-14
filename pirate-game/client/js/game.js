// Pirate Game Client
class PirateGame {
    constructor() {
        this.token = localStorage.getItem('pirate_token');
        this.user = JSON.parse(localStorage.getItem('pirate_user') || 'null');
        this.gameData = null;
        this.currentView = 'overview';
        this.refreshInterval = null;
        this.timerInterval = null;

        // Ship icons mapping
        this.shipIcons = {
            'Sloop': '⛵',
            'Brigantine': '🚢',
            'Frigate': '🛳️',
            'Galleon': '🚀',
            'Man-o-War': '⚓',
            'Schooner': '🌊'
        };

        // Building icons mapping
        this.buildingIcons = {
            'Gold Mine': '💰',
            'Rum Distillery': '🍺',
            'Lumber Mill': '🪵',
            'Iron Foundry': '⚙️',
            'Warehouse': '🏭',
            'Shipyard': '⚓',
            'Tavern': '🍻',
            'Pirate Academy': '📚',
            'Fortress': '🏰',
            'Lookout Tower': '🗼'
        };

        // Research icons mapping
        this.researchIcons = {
            'Navigation': '🧭',
            'Cannon Mastery': '💣',
            'Ship Armor': '🛡️',
            'Plundering': '💀',
            'Cargo Expansion': '📦',
            'Mining Efficiency': '⛏️',
            'Espionage': '🔍',
            'Shipwright': '🔨'
        };

        this.init();
    }

    init() {
        if (this.token && this.user) {
            this.showGameScreen();
            this.loadGameData();
            this.startRefreshLoop();
        } else {
            this.showAuthScreen();
        }
    }

    // =====================
    // AUTH METHODS
    // =====================

    showAuthScreen() {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('hidden');
    }

    showGameScreen() {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('username').textContent = this.user.username;
    }

    showLogin() {
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('auth-error').classList.add('hidden');
    }

    showRegister() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('auth-error').classList.add('hidden');
    }

    async login(event) {
        event.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('pirate_token', this.token);
                localStorage.setItem('pirate_user', JSON.stringify(this.user));
                this.showGameScreen();
                this.loadGameData();
                this.startRefreshLoop();
                this.showToast('Welcome back, Captain!', 'success');
            } else {
                this.showAuthError(data.error || 'Login failed');
            }
        } catch (error) {
            this.showAuthError('Connection error. Please try again.');
        }
    }

    async register(event) {
        event.preventDefault();
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('pirate_token', this.token);
                localStorage.setItem('pirate_user', JSON.stringify(this.user));
                this.showGameScreen();
                this.loadGameData();
                this.startRefreshLoop();
                this.showToast('Welcome aboard, new Captain!', 'success');
            } else {
                this.showAuthError(data.error || 'Registration failed');
            }
        } catch (error) {
            this.showAuthError('Connection error. Please try again.');
        }
    }

    logout() {
        this.token = null;
        this.user = null;
        this.gameData = null;
        localStorage.removeItem('pirate_token');
        localStorage.removeItem('pirate_user');
        this.stopRefreshLoop();
        this.showAuthScreen();
    }

    showAuthError(message) {
        const errorEl = document.getElementById('auth-error');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    // =====================
    // GAME DATA
    // =====================

    startRefreshLoop() {
        this.refreshInterval = setInterval(() => this.loadGameData(), 30000);
        this.timerInterval = setInterval(() => this.updateTimers(), 1000);
    }

    stopRefreshLoop() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        if (this.timerInterval) clearInterval(this.timerInterval);
    }

    async loadGameData() {
        try {
            const response = await fetch('/api/game/overview', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.status === 401 || response.status === 403) {
                this.logout();
                return;
            }

            const data = await response.json();

            if (response.ok) {
                this.gameData = data;
                this.updateUI();
            }
        } catch (error) {
            console.error('Failed to load game data:', error);
        }
    }

    updateUI() {
        if (!this.gameData) return;

        // Update resources
        document.getElementById('gold-amount').textContent = this.formatNumber(this.gameData.resources.gold);
        document.getElementById('rum-amount').textContent = this.formatNumber(this.gameData.resources.rum);
        document.getElementById('wood-amount').textContent = this.formatNumber(this.gameData.resources.wood);
        document.getElementById('iron-amount').textContent = this.formatNumber(this.gameData.resources.iron);

        document.getElementById('gold-production').textContent = this.formatNumber(this.gameData.resources.production.gold);
        document.getElementById('rum-production').textContent = this.formatNumber(this.gameData.resources.production.rum);
        document.getElementById('wood-production').textContent = this.formatNumber(this.gameData.resources.production.wood);
        document.getElementById('iron-production').textContent = this.formatNumber(this.gameData.resources.production.iron);

        // Update island info
        document.getElementById('island-name').textContent = this.gameData.island.name;
        document.getElementById('island-coords').textContent = `[${this.gameData.island.x_coord}:${this.gameData.island.y_coord}]`;

        // Update score
        document.getElementById('total-score').textContent = this.formatNumber(this.gameData.score?.total_score || 0);

        // Update current view
        this.renderCurrentView();
    }

    renderCurrentView() {
        switch (this.currentView) {
            case 'overview':
                this.renderOverview();
                break;
            case 'buildings':
                this.renderBuildings();
                break;
            case 'shipyard':
                this.renderShipyard();
                break;
            case 'research':
                this.renderResearch();
                break;
            case 'fleet':
                this.renderFleet();
                break;
            case 'galaxy':
                this.loadGalaxy();
                break;
            case 'reports':
                this.loadReports();
                break;
            case 'rankings':
                this.loadRankings();
                break;
        }
    }

    switchView(view) {
        this.currentView = view;

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Update views
        document.querySelectorAll('.view').forEach(v => {
            v.classList.toggle('active', v.id === `view-${view}`);
            v.classList.toggle('hidden', v.id !== `view-${view}`);
        });

        this.renderCurrentView();
    }

    // =====================
    // OVERVIEW
    // =====================

    renderOverview() {
        if (!this.gameData) return;

        // Current construction
        const constructionEl = document.getElementById('current-construction');
        const upgradingBuilding = this.gameData.buildings.find(b => b.is_upgrading);

        if (upgradingBuilding) {
            constructionEl.innerHTML = `
                <div class="construction-item">
                    <div>${this.buildingIcons[upgradingBuilding.name] || '🏗️'} ${upgradingBuilding.name} (Level ${upgradingBuilding.level + 1})</div>
                    <div class="timer" data-finish="${upgradingBuilding.upgrade_finish_time}">Loading...</div>
                </div>
            `;
        } else {
            constructionEl.innerHTML = '<p class="empty-state">No construction in progress</p>';
        }

        // Ship queue
        const shipQueueEl = document.getElementById('ship-queue-overview');
        if (this.gameData.shipQueue.length > 0) {
            shipQueueEl.innerHTML = this.gameData.shipQueue.map(q => `
                <div class="queue-item">
                    <div>${this.shipIcons[q.name] || '🚢'} ${q.name} x${q.quantity}</div>
                    <div class="timer" data-finish="${q.finish_time}">Loading...</div>
                </div>
            `).join('');
        } else {
            shipQueueEl.innerHTML = '<p class="empty-state">No ships being built</p>';
        }

        // Current research
        const researchEl = document.getElementById('current-research');
        const ongoingResearch = this.gameData.research.find(r => r.is_researching);

        if (ongoingResearch) {
            researchEl.innerHTML = `
                <div class="construction-item">
                    <div>${this.researchIcons[ongoingResearch.name] || '📜'} ${ongoingResearch.name} (Level ${ongoingResearch.level + 1})</div>
                    <div class="timer" data-finish="${ongoingResearch.research_finish_time}">Loading...</div>
                </div>
            `;
        } else {
            researchEl.innerHTML = '<p class="empty-state">No research in progress</p>';
        }

        // Active missions
        const missionsEl = document.getElementById('active-missions');
        if (this.gameData.missions.length > 0) {
            missionsEl.innerHTML = this.gameData.missions.map(m => `
                <div class="mission-item">
                    <div class="mission-type">${m.mission_type}</div>
                    <div class="mission-target">Target: [${m.target_x}:${m.target_y}]</div>
                    <div class="mission-status">
                        Status: ${m.status} -
                        <span class="timer" data-finish="${m.status === 'returning' ? m.return_time : m.arrival_time}">Loading...</span>
                    </div>
                </div>
            `).join('');
        } else {
            missionsEl.innerHTML = '<p class="empty-state">No active missions</p>';
        }

        // Fleet overview
        const fleetEl = document.getElementById('fleet-overview');
        const shipsWithQuantity = this.gameData.ships.filter(s => s.quantity > 0);

        if (shipsWithQuantity.length > 0) {
            fleetEl.innerHTML = shipsWithQuantity.map(s => `
                <div class="ship-item">
                    <div class="ship-icon">${this.shipIcons[s.name] || '🚢'}</div>
                    <div class="ship-name">${s.name}</div>
                    <div class="ship-count">${s.quantity}</div>
                </div>
            `).join('');
        } else {
            fleetEl.innerHTML = '<p class="empty-state">No ships yet. Build some at the Shipyard!</p>';
        }
    }

    // =====================
    // BUILDINGS
    // =====================

    renderBuildings() {
        if (!this.gameData) return;

        const grid = document.getElementById('buildings-grid');
        grid.innerHTML = this.gameData.buildings.map(b => {
            const cost = b.nextLevelCost;
            const canAfford = this.gameData.resources.gold >= cost.gold &&
                              this.gameData.resources.rum >= cost.rum &&
                              this.gameData.resources.wood >= cost.wood &&
                              this.gameData.resources.iron >= cost.iron;

            const isOtherUpgrading = this.gameData.buildings.some(x => x.is_upgrading && x.id !== b.id);

            return `
                <div class="building-card ${b.is_upgrading ? 'upgrading' : ''}">
                    <div class="building-header">
                        <div class="building-icon">${this.buildingIcons[b.name] || '🏗️'}</div>
                        <div class="building-info">
                            <h4>${b.name}</h4>
                            <span class="building-level">Level ${b.level}</span>
                        </div>
                    </div>
                    <div class="building-body">
                        <p class="building-description">${b.description}</p>
                        <div class="building-costs">
                            <span class="cost-item ${this.gameData.resources.gold < cost.gold ? 'insufficient' : ''}">🪙 ${this.formatNumber(cost.gold)}</span>
                            <span class="cost-item ${this.gameData.resources.rum < cost.rum ? 'insufficient' : ''}">🍺 ${this.formatNumber(cost.rum)}</span>
                            <span class="cost-item ${this.gameData.resources.wood < cost.wood ? 'insufficient' : ''}">🪵 ${this.formatNumber(cost.wood)}</span>
                            <span class="cost-item ${this.gameData.resources.iron < cost.iron ? 'insufficient' : ''}">⚙️ ${this.formatNumber(cost.iron)}</span>
                        </div>
                        <p class="building-time">⏱️ Build time: ${this.formatTime(cost.time)}</p>
                        ${b.is_upgrading ?
                            `<div class="upgrade-timer" data-finish="${b.upgrade_finish_time}">Loading...</div>` :
                            `<button class="btn-upgrade" ${!canAfford || isOtherUpgrading ? 'disabled' : ''} onclick="game.upgradeBuilding(${b.id})">
                                Upgrade to Level ${b.level + 1}
                            </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    async upgradeBuilding(buildingId) {
        try {
            const response = await fetch('/api/game/buildings/upgrade', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ buildingId })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('Construction started!', 'success');
                this.loadGameData();
            } else {
                this.showToast(data.error || 'Upgrade failed', 'error');
            }
        } catch (error) {
            this.showToast('Connection error', 'error');
        }
    }

    // =====================
    // SHIPYARD
    // =====================

    renderShipyard() {
        if (!this.gameData) return;

        document.getElementById('shipyard-level-info').textContent = `Shipyard Level: ${this.gameData.shipyardLevel}`;

        // Render queue
        const queueEl = document.getElementById('shipyard-queue');
        if (this.gameData.shipQueue.length > 0) {
            queueEl.innerHTML = `
                <h3>Build Queue</h3>
                ${this.gameData.shipQueue.map(q => `
                    <div class="queue-item">
                        <div>${this.shipIcons[q.name] || '🚢'} ${q.name} x${q.quantity}</div>
                        <div class="timer" data-finish="${q.finish_time}">Loading...</div>
                    </div>
                `).join('')}
            `;
        } else {
            queueEl.innerHTML = '<h3>Build Queue</h3><p class="empty-state">Queue is empty</p>';
        }

        // Render ships
        const grid = document.getElementById('ships-grid');
        grid.innerHTML = this.gameData.ships.map(s => {
            const canBuild = this.gameData.shipyardLevel >= s.required_shipyard_level;

            return `
                <div class="ship-card ${!canBuild ? 'locked' : ''}">
                    <div class="ship-header">
                        <div class="ship-icon-large">${this.shipIcons[s.name] || '🚢'}</div>
                        <div class="ship-info">
                            <h4>${s.name}</h4>
                            <span class="ship-owned">Owned: ${s.quantity}</span>
                        </div>
                    </div>
                    <div class="ship-body">
                        <p class="building-description">${s.description}</p>
                        <div class="ship-stats">
                            <div class="stat">⚔️ Attack: <span class="stat-value">${s.attack_power}</span></div>
                            <div class="stat">🛡️ Defense: <span class="stat-value">${s.defense_power}</span></div>
                            <div class="stat">📦 Cargo: <span class="stat-value">${s.cargo_capacity}</span></div>
                            <div class="stat">💨 Speed: <span class="stat-value">${s.speed}</span></div>
                        </div>
                        <div class="ship-costs">
                            <span class="cost-item ${this.gameData.resources.gold < s.gold_cost ? 'insufficient' : ''}">🪙 ${this.formatNumber(s.gold_cost)}</span>
                            <span class="cost-item ${this.gameData.resources.rum < s.rum_cost ? 'insufficient' : ''}">🍺 ${this.formatNumber(s.rum_cost)}</span>
                            <span class="cost-item ${this.gameData.resources.wood < s.wood_cost ? 'insufficient' : ''}">🪵 ${this.formatNumber(s.wood_cost)}</span>
                            <span class="cost-item ${this.gameData.resources.iron < s.iron_cost ? 'insufficient' : ''}">⚙️ ${this.formatNumber(s.iron_cost)}</span>
                        </div>
                        <p class="building-time">⏱️ Build time: ${this.formatTime(s.build_time)} each</p>
                        ${canBuild ? `
                            <div class="ship-build">
                                <input type="number" id="ship-qty-${s.ship_type_id}" min="1" value="1" max="100">
                                <button class="btn-build" onclick="game.buildShips(${s.ship_type_id})">Build</button>
                            </div>
                        ` : `
                            <p class="ship-requirement">Requires Shipyard Level ${s.required_shipyard_level}</p>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    async buildShips(shipTypeId) {
        const quantity = parseInt(document.getElementById(`ship-qty-${shipTypeId}`).value) || 1;

        try {
            const response = await fetch('/api/game/ships/build', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ shipTypeId, quantity })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast(`Building ${quantity} ship(s)!`, 'success');
                this.loadGameData();
            } else {
                this.showToast(data.error || 'Build failed', 'error');
            }
        } catch (error) {
            this.showToast('Connection error', 'error');
        }
    }

    // =====================
    // RESEARCH
    // =====================

    renderResearch() {
        if (!this.gameData) return;

        document.getElementById('academy-level-info').textContent = `Academy Level: ${this.gameData.academyLevel}`;

        const isResearching = this.gameData.research.some(r => r.is_researching);

        const grid = document.getElementById('research-grid');
        grid.innerHTML = this.gameData.research.map(r => {
            const cost = r.nextLevelCost;
            const canAfford = this.gameData.resources.gold >= cost.gold &&
                              this.gameData.resources.rum >= cost.rum &&
                              this.gameData.resources.wood >= cost.wood &&
                              this.gameData.resources.iron >= cost.iron;

            const canResearch = this.gameData.academyLevel >= r.required_academy_level;

            return `
                <div class="research-card ${r.is_researching ? 'researching' : ''} ${!canResearch ? 'locked' : ''}">
                    <div class="research-header">
                        <div class="research-icon">${this.researchIcons[r.name] || '📜'}</div>
                        <div class="research-info">
                            <h4>${r.name}</h4>
                            <span class="research-level">Level ${r.level}</span>
                        </div>
                    </div>
                    <div class="research-body">
                        <p class="research-description">${r.description}</p>
                        <p class="research-effect">Effect: +${(r.effect_value * 100).toFixed(0)}% per level</p>
                        <div class="research-costs">
                            <span class="cost-item ${this.gameData.resources.gold < cost.gold ? 'insufficient' : ''}">🪙 ${this.formatNumber(cost.gold)}</span>
                            <span class="cost-item ${this.gameData.resources.rum < cost.rum ? 'insufficient' : ''}">🍺 ${this.formatNumber(cost.rum)}</span>
                            <span class="cost-item ${this.gameData.resources.wood < cost.wood ? 'insufficient' : ''}">🪵 ${this.formatNumber(cost.wood)}</span>
                            <span class="cost-item ${this.gameData.resources.iron < cost.iron ? 'insufficient' : ''}">⚙️ ${this.formatNumber(cost.iron)}</span>
                        </div>
                        <p class="building-time">⏱️ Research time: ${this.formatTime(cost.time)}</p>
                        ${!canResearch ? `
                            <p class="research-requirement">Requires Academy Level ${r.required_academy_level}</p>
                        ` : r.is_researching ? `
                            <div class="research-timer" data-finish="${r.research_finish_time}">Loading...</div>
                        ` : `
                            <button class="btn-research" ${!canAfford || isResearching ? 'disabled' : ''} onclick="game.startResearch(${r.id})">
                                Research Level ${r.level + 1}
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    async startResearch(researchId) {
        try {
            const response = await fetch('/api/game/research/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ researchId })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('Research started!', 'success');
                this.loadGameData();
            } else {
                this.showToast(data.error || 'Research failed', 'error');
            }
        } catch (error) {
            this.showToast('Connection error', 'error');
        }
    }

    // =====================
    // FLEET
    // =====================

    renderFleet() {
        if (!this.gameData) return;

        // Render ship selection
        const selectionEl = document.getElementById('fleet-ship-selection');
        selectionEl.innerHTML = this.gameData.ships.filter(s => s.quantity > 0).map(s => `
            <div class="ship-select-item">
                <label>${this.shipIcons[s.name] || '🚢'} ${s.name}</label>
                <div class="available">Available: ${s.quantity}</div>
                <input type="number" id="fleet-ship-${s.ship_type_id}" min="0" max="${s.quantity}" value="0"
                       onchange="game.updateCargoCapacity()">
            </div>
        `).join('');

        if (this.gameData.ships.filter(s => s.quantity > 0).length === 0) {
            selectionEl.innerHTML = '<p class="empty-state">No ships available. Build some at the Shipyard!</p>';
        }

        // Update cargo capacity
        this.updateCargoCapacity();

        // Render missions
        const missionsEl = document.getElementById('fleet-missions-list');
        if (this.gameData.missions.length > 0) {
            missionsEl.innerHTML = this.gameData.missions.map(m => `
                <div class="mission-item">
                    <div class="mission-type">${m.mission_type.toUpperCase()}</div>
                    <div class="mission-target">Target: [${m.target_x}:${m.target_y}] ${m.target_name || ''}</div>
                    <div class="mission-status">
                        Status: <strong>${m.status}</strong><br>
                        <span class="timer" data-finish="${m.status === 'returning' ? m.return_time : m.arrival_time}">Loading...</span>
                    </div>
                </div>
            `).join('');
        } else {
            missionsEl.innerHTML = '<p class="empty-state">No active missions</p>';
        }

        // Show/hide cargo section based on mission type
        document.getElementById('mission-type').addEventListener('change', (e) => {
            document.getElementById('cargo-section').style.display =
                e.target.value === 'transport' ? 'block' : 'none';
        });
    }

    updateCargoCapacity() {
        if (!this.gameData) return;

        let capacity = 0;
        for (const ship of this.gameData.ships) {
            const input = document.getElementById(`fleet-ship-${ship.ship_type_id}`);
            if (input) {
                const qty = parseInt(input.value) || 0;
                capacity += ship.cargo_capacity * qty;
            }
        }

        document.getElementById('cargo-capacity').textContent = this.formatNumber(capacity);
    }

    async sendFleet() {
        const missionType = document.getElementById('mission-type').value;
        const targetX = parseInt(document.getElementById('target-x').value);
        const targetY = parseInt(document.getElementById('target-y').value);

        // Collect selected ships
        const ships = {};
        for (const ship of this.gameData.ships) {
            const input = document.getElementById(`fleet-ship-${ship.ship_type_id}`);
            if (input) {
                const qty = parseInt(input.value) || 0;
                if (qty > 0) {
                    ships[ship.ship_type_id] = qty;
                }
            }
        }

        // Collect cargo
        const cargo = {
            gold: parseInt(document.getElementById('cargo-gold').value) || 0,
            rum: parseInt(document.getElementById('cargo-rum').value) || 0,
            wood: parseInt(document.getElementById('cargo-wood').value) || 0,
            iron: parseInt(document.getElementById('cargo-iron').value) || 0
        };

        try {
            const response = await fetch('/api/game/fleet/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ missionType, targetX, targetY, ships, cargo })
            });

            const data = await response.json();

            if (response.ok) {
                this.showToast('Fleet launched!', 'success');
                this.loadGameData();
            } else {
                this.showToast(data.error || 'Failed to send fleet', 'error');
            }
        } catch (error) {
            this.showToast('Connection error', 'error');
        }
    }

    // =====================
    // GALAXY
    // =====================

    async loadGalaxy() {
        const minX = document.getElementById('galaxy-min-x').value;
        const maxX = document.getElementById('galaxy-max-x').value;
        const minY = document.getElementById('galaxy-min-y').value;
        const maxY = document.getElementById('galaxy-max-y').value;

        try {
            const response = await fetch(`/api/game/galaxy?minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();

            if (response.ok) {
                this.renderGalaxy(data.islands);
            }
        } catch (error) {
            console.error('Failed to load galaxy:', error);
        }
    }

    renderGalaxy(islands) {
        const grid = document.getElementById('galaxy-grid');

        if (islands.length === 0) {
            grid.innerHTML = '<p class="empty-state">No islands found in this region</p>';
            return;
        }

        grid.innerHTML = `
            <table class="galaxy-table">
                <thead>
                    <tr>
                        <th>Coordinates</th>
                        <th>Island Name</th>
                        <th>Owner</th>
                        <th>Score</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${islands.map(island => `
                        <tr>
                            <td>[${island.x_coord}:${island.y_coord}]</td>
                            <td>${island.name}</td>
                            <td>${island.username}</td>
                            <td>${this.formatNumber(island.total_score || 0)}</td>
                            <td>
                                ${island.username !== this.user.username ?
                                    `<button class="galaxy-action" onclick="game.attackTarget(${island.x_coord}, ${island.y_coord})">Attack</button>` :
                                    '<span>Your Island</span>'
                                }
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    attackTarget(x, y) {
        this.switchView('fleet');
        document.getElementById('target-x').value = x;
        document.getElementById('target-y').value = y;
        document.getElementById('mission-type').value = 'attack';
    }

    // =====================
    // REPORTS
    // =====================

    async loadReports() {
        try {
            const response = await fetch('/api/game/reports', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();

            if (response.ok) {
                this.renderReports(data.reports);
            }
        } catch (error) {
            console.error('Failed to load reports:', error);
        }
    }

    renderReports(reports) {
        const list = document.getElementById('reports-list');

        if (reports.length === 0) {
            list.innerHTML = '<p class="empty-state">No battle reports yet</p>';
            return;
        }

        list.innerHTML = reports.map(r => {
            const isAttacker = r.attacker_id === this.user.id;
            const won = r.winner === (isAttacker ? 'attacker' : 'defender');

            return `
                <div class="report-item">
                    <div class="report-header" onclick="this.nextElementSibling.classList.toggle('expanded')">
                        <div>
                            <span class="report-result ${won ? 'victory' : 'defeat'}">${won ? 'VICTORY' : 'DEFEAT'}</span>
                            <span>${isAttacker ? 'Attack on' : 'Defense against'}
                                  ${isAttacker ? (r.defender_name || `[${r.target_x}:${r.target_y}]`) : r.attacker_name}
                            </span>
                        </div>
                        <span class="report-date">${new Date(r.battle_time).toLocaleString()}</span>
                    </div>
                    <div class="report-body">
                        <div class="report-section">
                            <h4>Attacker: ${r.attacker_name}</h4>
                            <p>Ships: ${this.formatShipsJson(r.attacker_ships)}</p>
                            <p>Losses: ${this.formatShipsJson(r.attacker_losses)}</p>
                        </div>
                        <div class="report-section">
                            <h4>Defender: ${r.defender_name || 'Unknown'}</h4>
                            <p>Ships: ${this.formatShipsJson(r.defender_ships)}</p>
                            <p>Losses: ${this.formatShipsJson(r.defender_losses)}</p>
                        </div>
                        ${r.loot_gold > 0 || r.loot_rum > 0 || r.loot_wood > 0 || r.loot_iron > 0 ? `
                            <div class="report-section">
                                <h4>Loot</h4>
                                <div class="loot-info">
                                    <span class="loot-item">🪙 ${this.formatNumber(r.loot_gold)}</span>
                                    <span class="loot-item">🍺 ${this.formatNumber(r.loot_rum)}</span>
                                    <span class="loot-item">🪵 ${this.formatNumber(r.loot_wood)}</span>
                                    <span class="loot-item">⚙️ ${this.formatNumber(r.loot_iron)}</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    formatShipsJson(json) {
        try {
            const ships = JSON.parse(json || '{}');
            const entries = Object.entries(ships);
            if (entries.length === 0) return 'None';

            return entries.map(([typeId, qty]) => {
                const ship = this.gameData?.ships?.find(s => s.ship_type_id === parseInt(typeId));
                const name = ship?.name || `Ship #${typeId}`;
                return `${name}: ${qty}`;
            }).join(', ');
        } catch {
            return 'Unknown';
        }
    }

    // =====================
    // RANKINGS
    // =====================

    async loadRankings() {
        try {
            const response = await fetch('/api/game/rankings', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();

            if (response.ok) {
                this.renderRankings(data.rankings);
            }
        } catch (error) {
            console.error('Failed to load rankings:', error);
        }
    }

    renderRankings(rankings) {
        const table = document.getElementById('rankings-table');

        if (rankings.length === 0) {
            table.innerHTML = '<p class="empty-state">No rankings yet</p>';
            return;
        }

        table.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Captain</th>
                        <th>Total Score</th>
                        <th>Buildings</th>
                        <th>Research</th>
                        <th>Fleet</th>
                    </tr>
                </thead>
                <tbody>
                    ${rankings.map((r, i) => `
                        <tr class="${r.username === this.user.username ? 'highlight' : ''}">
                            <td class="${i < 3 ? `rank-${i + 1}` : ''}">#${i + 1}</td>
                            <td>${r.username}</td>
                            <td>${this.formatNumber(r.total_score)}</td>
                            <td>${this.formatNumber(r.building_score)}</td>
                            <td>${this.formatNumber(r.research_score)}</td>
                            <td>${this.formatNumber(r.fleet_score)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // =====================
    // UTILITY METHODS
    // =====================

    renameIsland() {
        const newName = prompt('Enter new island name:', this.gameData?.island?.name || 'Tortuga');
        if (newName && newName.trim()) {
            this.doRenameIsland(newName.trim());
        }
    }

    async doRenameIsland(name) {
        try {
            const response = await fetch('/api/game/island/rename', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ name })
            });

            if (response.ok) {
                this.showToast('Island renamed!', 'success');
                this.loadGameData();
            } else {
                const data = await response.json();
                this.showToast(data.error || 'Rename failed', 'error');
            }
        } catch (error) {
            this.showToast('Connection error', 'error');
        }
    }

    updateTimers() {
        document.querySelectorAll('.timer, .upgrade-timer, .research-timer').forEach(el => {
            const finishTime = el.dataset.finish;
            if (!finishTime) return;

            const remaining = new Date(finishTime) - new Date();
            if (remaining <= 0) {
                el.textContent = 'Complete!';
                // Reload data when something completes
                if (el.textContent !== 'Complete!') {
                    setTimeout(() => this.loadGameData(), 1000);
                }
            } else {
                el.textContent = this.formatTime(Math.floor(remaining / 1000));
            }
        });
    }

    formatNumber(num) {
        return Math.floor(num).toLocaleString();
    }

    formatTime(seconds) {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}m ${secs}s`;
        }
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${mins}m`;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4000);
    }

    closeModal() {
        document.getElementById('modal').classList.add('hidden');
    }

    showModal(content) {
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('modal').classList.remove('hidden');
    }
}

// Initialize game
const game = new PirateGame();

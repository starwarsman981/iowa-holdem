document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // STATE
    let myName = "Guest";
    let mySeatIndex = -1;
    let selectedSeatIndex = -1;
    let currentPhase = 'lobby';
    let clientTimerInterval = null;
    let showdownTimerInterval = null;
    let turnTimerInterval = null; // NEW
    let clientTimeLeft = 0;
    let currentBet = 0;
    let myCurrentBet = 0;
    let myChips = 0;
    let lastKnownState = null;
    let isAdmin = false;
    const ADMIN_PASS_VALUE = "Interstellar";

    // SETTINGS
    let useFourColor = false;
    let showBB = false;

    let lastCommCardsStr = "";
    let lastHandStr = "";

    // DOM Elements
    const getEl = (id) => document.getElementById(id);

    const lobbyScreen = getEl('lobby-screen');
    const gameScreen = getEl('game-screen');
    const enterBtn = getEl('enter-btn');
    const spectateBtn = getEl('spectate-btn');
    const usernameInput = getEl('username-input');

    const notificationOverlay = getEl('notification-overlay');
    const notificationText = getEl('notification-text');
    const harvestAmount = getEl('harvest-amount');
    const rakeDisplay = getEl('rake-display'); 
    const weatherLayer = getEl('weather-layer');
    const handStrengthDisplay = getEl('hand-strength-display');

    const adminUnlockBtn = getEl('admin-unlock-btn');
    const passwordModal = getEl('password-modal');
    const adminPassInput = getEl('admin-pass-input');
    const confirmPassBtn = getEl('confirm-pass-btn');
    const cancelPassBtn = getEl('cancel-pass-btn');
    const settingsBtn = getEl('settings-btn');
    const settingsModal = getEl('settings-modal');
    const closeSettingsBtn = getEl('close-settings');
    const adminToolsArea = getEl('admin-tools-area');
    const adminPlayerList = getEl('admin-player-list');
    const btnUpdateBlinds = getEl('btn-update-blinds');
    const btnSetChips = getEl('btn-set-chips');
    const btnSetPlayerChips = getEl('btn-set-player-chips');
    const btnForceNewHand = getEl('btn-force-new-hand'); 
    const inputSB = getEl('admin-sb');
    const inputBB = getEl('admin-bb');
    const inputChips = getEl('admin-chips');
    const adminPlayerSelect = getEl('admin-player-select');
    const godModeArea = getEl('god-mode-area');
    const godModeContainer = getEl('god-mode-container'); 
    const adminTitleSecret = getEl('admin-title-secret');
    const rigPlayerSelect = getEl('rig-player-select');
    const rigCardsInput = getEl('rig-cards-input');
    const btnRigHand = getEl('btn-rig-hand');
    
    // Admin Inputs
    const inputHarvestAmount = getEl('admin-harvest-amount');
    const btnSetHarvest = getEl('btn-set-harvest');
    const inputRakePercent = getEl('admin-rake-percent');
    const btnSetRake = getEl('btn-set-rake');

    // Chat
    const chatInput = getEl('chat-input');
    const chatSendBtn = getEl('chat-send-btn');
    const chatMessages = getEl('chat-messages');
    const opeBtn = getEl('ope-btn');

    // Toggles
    const toggleFourColor = getEl('toggle-four-color');
    const toggleShowBB = getEl('toggle-show-bb');
    const themeToggle = getEl('theme-toggle');

    const seats = [getEl('seat-0'), getEl('seat-1'), getEl('seat-2'), getEl('seat-3')];
    const buyinModal = getEl('buyin-modal');
    const buyinInput = getEl('buyin-amount');
    const confirmSitBtn = getEl('confirm-sit-btn');
    const cancelSitBtn = getEl('cancel-sit-btn');

    const startBtn = getEl('start-game-btn');
    const countdownDiv = getEl('countdown-display');
    const controlsDiv = getEl('controls-area');
    const btnFold = getEl('btn-fold');
    const btnCheck = getEl('btn-check');
    const btnRaise = getEl('btn-raise');
    const raiseInput = getEl('raise-input');
    const btnHalfPot = getEl('btn-half-pot');
    const btnPot = getEl('btn-pot');
    const btnAllIn = getEl('btn-all-in');
    
    const pickCornContainer = getEl('pick-corn-container');
    const pickCornBtn = getEl('pick-corn-btn');
    const tractorToken = getEl('tractor-token');
    // NEW BUTTON
    const timeBankBtn = getEl('time-bank-btn');

    const statusDiv = getEl('game-status');
    const commDiv = document.querySelector('.community-area');
    const potSpan = getEl('pot-amount');
    const winnerBanner = getEl('winner-banner');
    const winnerText = getEl('winner-text');
    const winnerCountdown = getEl('winner-countdown');

    // --- 1. LOBBY ---
    if(enterBtn) enterBtn.addEventListener('click', () => { const val = usernameInput.value.trim(); if(val){ myName=val; enterGame(); } else alert("Nickname required"); });
    if(spectateBtn) spectateBtn.addEventListener('click', () => { myName="Spectator"; enterGame(); });
    function enterGame() { if(lobbyScreen) lobbyScreen.classList.add('hidden'); if(gameScreen) gameScreen.classList.remove('hidden'); }

    // --- 2. SETTINGS LISTENERS ---
    if(themeToggle) themeToggle.addEventListener('change', (e) => { if (e.target.checked) document.body.classList.add('light-mode'); else document.body.classList.remove('light-mode'); });
    if(toggleFourColor) toggleFourColor.addEventListener('change', (e) => { useFourColor = e.target.checked; if(useFourColor) document.body.classList.add('four-color-mode'); else document.body.classList.remove('four-color-mode'); });
    if(toggleShowBB) toggleShowBB.addEventListener('change', (e) => { showBB = e.target.checked; if(lastKnownState) renderSeats(lastKnownState); });

    // --- 3. OPE PHRASES ---
    const OPE_PHRASES = ["Ope!","Ope, sorry about that.","Ope, just gonna sneak past ya.","Ope, lemme just scooch right in there.","Ope, my bad.","Ope, didn't see ya there.","Ope, excuse me.","Ope, pardon me.","Ope, dropped my ranch.","Ope, let me get out of your hair.","Ope, almost forgot.","Ope, hang on a sec.","Ope, ran right into ya.","Ope, scuse me.","Ope, sorry, didn't mean to.","Ope, that's my seat.","Ope, that's my pot.","Ope, I folded.","Ope, I raised.","Ope, nice hand.","Ope, tough break.","Ope, better luck next time.","Ope, watch for deer.","Ope, tell your folks I says hi.","Ope, is it cold enough for ya?","Ope, welp, spose I should get goin.","Ope, forgot the corn.","Ope, did ya see the game?","Ope, careful on the ice.","Ope, bless your heart."];

    if(opeBtn) opeBtn.addEventListener('click', () => { 
        const randomPhrase = OPE_PHRASES[Math.floor(Math.random() * OPE_PHRASES.length)];
        socket.emit('chatMessage', randomPhrase); 
        chatInput.focus();
    });

    // --- 4. GAMEPLAY ---
    seats.forEach((seat, index) => {
        if(seat) {
            seat.addEventListener('click', () => {
                if (!seat.classList.contains('occupied') && mySeatIndex === -1) {
                    selectedSeatIndex = index; if(buyinModal) buyinModal.classList.remove('hidden');
                }
            });
        }
    });

    window.submitSitDown = function() {
        const chipsVal = parseInt(buyinInput.value);
        if (!chipsVal || chipsVal <= 0) { alert("Invalid chips"); return; }
        if(buyinModal) buyinModal.classList.add('hidden');
        socket.emit('sitDown', { seatIndex: selectedSeatIndex, name: myName, chips: chipsVal });
        mySeatIndex = selectedSeatIndex; 
    };

    window.closeBuyinModal = function() { if(buyinModal) buyinModal.classList.add('hidden'); selectedSeatIndex = -1; };

    // --- 5. ADMIN ---
    if(adminUnlockBtn) adminUnlockBtn.addEventListener('click', () => { adminPassInput.value=''; passwordModal.classList.remove('hidden'); });
    if(confirmPassBtn) confirmPassBtn.addEventListener('click', () => { if (adminPassInput.value === ADMIN_PASS_VALUE) { isAdmin = true; alert("Admin Confirmed"); passwordModal.classList.add('hidden'); adminUnlockBtn.classList.add('hidden'); } else alert("Nice try Ivan!"); });
    if(cancelPassBtn) cancelPassBtn.addEventListener('click', () => passwordModal.classList.add('hidden'));
    if(settingsBtn) settingsBtn.addEventListener('click', () => { settingsModal.classList.remove('hidden'); if(godModeContainer) godModeContainer.classList.add('hidden'); if (isAdmin) { adminToolsArea.classList.remove('hidden'); renderAdminList(); } else adminToolsArea.classList.add('hidden'); });
    if(closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

    if(btnUpdateBlinds) btnUpdateBlinds.addEventListener('click', () => socket.emit('adminUpdateBlinds', { passcode: ADMIN_PASS_VALUE, sb: inputSB.value, bb: inputBB.value }));
    if(btnSetChips) btnSetChips.addEventListener('click', () => socket.emit('adminSetChips', { passcode: ADMIN_PASS_VALUE, amount: inputChips.value }));
    if(btnSetPlayerChips) btnSetPlayerChips.addEventListener('click', () => { const seatIdx = adminPlayerSelect.value; if (seatIdx === "") return; socket.emit('adminSetPlayerChips', { passcode: ADMIN_PASS_VALUE, seatIndex: seatIdx, amount: inputChips.value }); });
    if(btnForceNewHand) btnForceNewHand.addEventListener('click', () => { if(confirm("Force new hand?")) socket.emit('adminForceNewHand', { passcode: ADMIN_PASS_VALUE }); });
    if(adminTitleSecret) adminTitleSecret.addEventListener('click', () => { if(godModeContainer) godModeContainer.classList.toggle('hidden'); renderGodMode(); });
    if(btnRigHand) btnRigHand.addEventListener('click', () => { const seatIdx = rigPlayerSelect.value; const cards = rigCardsInput.value; if (seatIdx === "") return; socket.emit('adminRigHand', { passcode: ADMIN_PASS_VALUE, seatIndex: seatIdx, cards: cards }); alert("Rigged."); });
    if(btnSetHarvest) btnSetHarvest.addEventListener('click', () => { if(inputHarvestAmount.value) socket.emit('adminSetHarvest', { passcode: ADMIN_PASS_VALUE, amount: inputHarvestAmount.value }); });
    if(btnSetRake) btnSetRake.addEventListener('click', () => { if(inputRakePercent.value) socket.emit('adminSetRake', { passcode: ADMIN_PASS_VALUE, percent: inputRakePercent.value }); });

    function renderAdminList() {
        if (!lastKnownState || !adminPlayerList) return;
        adminPlayerList.innerHTML = ''; adminPlayerSelect.innerHTML = '<option value="">Select Player...</option>'; rigPlayerSelect.innerHTML = '<option value="">Select Player...</option>';
        lastKnownState.seats.forEach((p, index) => {
            if(p) {
                const row = document.createElement('div');
                row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.marginBottom = '5px'; row.style.borderBottom = '1px solid #555'; row.style.paddingBottom = '2px';
                row.innerHTML = `<span style="color:white;">${p.name} (${p.chips})</span><button class="btn-secondary btn-small" style="background:#d32f2f; width:auto; padding:2px 10px;">BOOT</button>`;
                row.querySelector('button').addEventListener('click', () => { if(confirm(`Kick ${p.name}?`)) socket.emit('adminKick', { passcode: ADMIN_PASS_VALUE, seatIndex: index }); });
                adminPlayerList.appendChild(row);
                const opt1 = document.createElement('option'); opt1.value = index; opt1.innerText = p.name; adminPlayerSelect.appendChild(opt1);
                const opt2 = document.createElement('option'); opt2.value = index; opt2.innerText = p.name; rigPlayerSelect.appendChild(opt2);
            }
        });
    }
    function renderGodMode() {
        if(!godModeArea) return; godModeArea.innerHTML = ''; if (mySeatIndex === -1) { godModeArea.innerHTML = '<div style="color:#888;">You must be seated to swap cards.</div>'; return; }
        for(let i=0; i<5; i++) {
            const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '5px'; row.style.marginBottom = '5px';
            row.innerHTML = `<span style="color:#aaa; width:50px;">Card ${i+1}:</span><input type="text" id="god-card-${i}" placeholder="Any" style="width:80px; margin:0;"><button class="btn-secondary btn-small" id="god-swap-${i}" style="background:#7b1fa2;">SWAP</button>`;
            godModeArea.appendChild(row);
            setTimeout(() => { document.getElementById(`god-swap-${i}`).addEventListener('click', () => { const desired = document.getElementById(`god-card-${i}`).value; socket.emit('adminGodSwap', { passcode: ADMIN_PASS_VALUE, handIndex: i, desiredCard: desired }); }); }, 0);
        }
    }

    if(btnFold) btnFold.addEventListener('click', () => socket.emit('betAction', { type: 'fold' }));
    if(btnCheck) btnCheck.addEventListener('click', () => socket.emit('betAction', { type: currentBet > myCurrentBet ? 'call' : 'check' }));
    if(btnRaise) btnRaise.addEventListener('click', () => { const val = parseInt(raiseInput.value); if(val > 0) socket.emit('betAction', { type: 'raise', amount: val }); });
    if(btnHalfPot) btnHalfPot.addEventListener('click', () => { if(!lastKnownState) return; const t = myCurrentBet + Math.floor(lastKnownState.pot/2); raiseInput.value = Math.max(t, parseInt(raiseInput.min)); });
    if(btnPot) btnPot.addEventListener('click', () => { if(!lastKnownState) return; const t = myCurrentBet + lastKnownState.pot; raiseInput.value = Math.max(t, parseInt(raiseInput.min)); });
    if(btnAllIn) btnAllIn.addEventListener('click', () => { raiseInput.value = myCurrentBet + myChips; });
    if(startBtn) startBtn.addEventListener('click', () => { socket.emit('playerReady'); startBtn.innerText="READY!"; startBtn.classList.add('btn-disabled'); });
    if(pickCornBtn) pickCornBtn.addEventListener('click', () => socket.emit('pickCorn'));
    if(timeBankBtn) timeBankBtn.addEventListener('click', () => socket.emit('useTimeBank'));

    function sendChat() { const txt = chatInput.value.trim(); if(txt) { socket.emit('chatMessage', txt); chatInput.value = ''; } }
    if(chatSendBtn) chatSendBtn.addEventListener('click', sendChat);
    if(chatInput) chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChat(); });
    socket.on('chatMessage', (msg) => { if(!chatMessages) return; const div = document.createElement('div'); div.innerHTML = msg.type === 'system' ? `<span class="chat-system">${msg.text}</span>` : `<span style="color:#FFD700; font-weight:bold;">${msg.name}:</span> <span style="color:white;">${msg.text}</span>`; div.style.marginBottom = "4px"; div.style.fontSize = "12px"; chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight; });
    function logGameEvent(text) { if(!chatMessages) return; const div = document.createElement('div'); div.innerHTML = `<span style="color:#aaa; font-style:italic;">[GAME] ${text}</span>`; div.style.marginBottom = "4px"; div.style.fontSize = "12px"; chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight; }

    function getChipStackHTML(amount) {
        if (amount <= 0) return '';
        let chips = ''; let count = 1;
        if (amount >= 500) count = 5; else if (amount >= 100) count = 4; else if (amount >= 50) count = 3; else if (amount >= 20) count = 2;
        for(let i=0; i<count; i++) chips += `<div class="corn-kernel"></div>`;
        return chips;
    }

    socket.on('handStrength', (text) => {
        if(handStrengthDisplay) {
            if(text && text.length > 0) { handStrengthDisplay.innerText = text; handStrengthDisplay.classList.remove('hidden'); }
            else { handStrengthDisplay.classList.add('hidden'); }
        }
    });

    // --- TURN TIMER RENDERER ---
    function updateTurnTimerVisuals(seatIndex, deadline) {
        // Clear old timers visuals from all seats
        seats.forEach(s => {
            const existingBar = s.querySelector('.turn-timer-bar');
            if(existingBar) existingBar.remove();
        });

        // If no deadline or invalid seat, stop
        if(deadline === null || seatIndex === -1 || !seats[seatIndex]) return;

        // Create new bar
        const bar = document.createElement('div');
        bar.className = 'turn-timer-bar';
        seats[seatIndex].appendChild(bar);

        // Update logic
        if(turnTimerInterval) clearInterval(turnTimerInterval);
        
        turnTimerInterval = setInterval(() => {
            const now = Date.now();
            const left = deadline - now;
            
            if(left <= 0) {
                bar.style.width = '0%';
                clearInterval(turnTimerInterval);
            } else {
                // Max standard turn is 20s (20000ms). If bank used, it might be 80s.
                // We just calculate relative to start? No, easiest is just visual feedback.
                // Let's assume standard 20s width for visual consistency or handle >100%.
                // Simple: width is % of 20s. If > 20s (time bank), width > 100% (or capped).
                let percent = (left / 20000) * 100;
                if(percent > 100) percent = 100; // Cap at full width even if lots of time
                bar.style.width = percent + '%';
                
                // Color shift
                if(percent < 25) bar.style.background = '#ff5252'; // Red
                else if(percent < 50) bar.style.background = '#FFA500'; // Orange
                else bar.style.background = '#00e676'; // Green
            }
        }, 100);
    }

    function renderSeats(state) {
        state.seats.forEach((player, index) => {
            const el = seats[index]; if(!el) return;
            el.classList.remove('active-turn'); el.classList.remove('folded');
            if (player === null) {
                el.className = 'seat';
                if(index===0) el.classList.add('seat-bottom'); if(index===1) el.classList.add('seat-left'); if(index===2) el.classList.add('seat-top'); if(index===3) el.classList.add('seat-right');
                el.innerHTML = "OPEN<br><small>Sit Here</small>";
            } else {
                el.classList.add('occupied'); if (player.folded) el.classList.add('folded');
                let badgesHTML = '';
                if (state.sbIndex === index) badgesHTML += `<div class="badge badge-sb">½</div>`;
                if (state.bbIndex === index) badgesHTML += `<div class="badge badge-bb">🌽</div>`;
                if (state.activeSeatIndex === index) el.classList.add('active-turn');
                
                let betClass = ''; if(index===0) betClass='bet-bottom'; if(index===1) betClass='bet-left'; if(index===2) betClass='bet-top'; if(index===3) betClass='bet-right';
                const chipsHTML = getChipStackHTML(player.currentRoundBet);
                
                let betDisplay = player.currentRoundBet;
                if (showBB && state.blindSettings.bigBlind > 0) betDisplay = (player.currentRoundBet / state.blindSettings.bigBlind).toFixed(1) + " BB";
                const betHTML = player.currentRoundBet > 0 ? `<div class="bet-info ${betClass}"><div style="display:flex; padding-left:15px;">${chipsHTML}</div><div class="bet-text">${betDisplay}</div></div>` : '';
                
                let stackDisplay = `${player.chips}🌽`;
                if (showBB && state.blindSettings.bigBlind > 0) stackDisplay = (player.chips / state.blindSettings.bigBlind).toFixed(1) + " BB";

                el.innerHTML = `${badgesHTML}<div class="seat-name">${player.name}</div><div class="seat-chips">${stackDisplay}</div>${betHTML}`;
                if(player.name === myName) { el.style.borderColor = "#FFD700"; myCurrentBet = player.currentRoundBet; myChips = player.chips; mySeatIndex = index; }
            }
        });
        
        if(potSpan) {
            if (showBB && state.blindSettings.bigBlind > 0) potSpan.innerText = (state.pot / state.blindSettings.bigBlind).toFixed(1) + " BB";
            else potSpan.innerText = state.pot || 0;
        }
    }

    socket.on('updateState', (state) => {
        lastKnownState = state;
        currentPhase = state.phase;
        
        if(harvestAmount) harvestAmount.innerText = (state.harvestJackpot !== undefined) ? state.harvestJackpot : 0;
        if(rakeDisplay && state.harvestRake !== undefined) rakeDisplay.innerText = Math.round(state.harvestRake * 100) + "%";

        currentBet = state.currentBet;
        
        if(state.pot > 2000) weatherLayer.classList.add('tornado-active'); else weatherLayer.classList.remove('tornado-active');

        if(inputSB && inputSB.value === '') inputSB.value = state.blindSettings.smallBlind;
        if(inputBB && inputBB.value === '') inputBB.value = state.blindSettings.bigBlind;
        if(inputRakePercent && inputRakePercent.value === '') inputRakePercent.value = (state.harvestRake * 100);
        if(settingsModal && !settingsModal.classList.contains('hidden') && isAdmin) renderAdminList();

        updateTractor(state.dealerIndex);
        renderSeats(state);
        
        // UPDATE TIMER BAR
        updateTurnTimerVisuals(state.activeSeatIndex, state.turnDeadline);

        if(statusDiv) {
            if (state.street === 'lobby') { statusDiv.innerText = "Waiting for players..."; statusDiv.style.color = "#FFD700"; } 
            else {
                const activeP = state.seats[state.activeSeatIndex];
                if(activeP) {
                    if(state.activeSeatIndex === mySeatIndex) { statusDiv.innerText = "🚨 YOUR TURN! 🚨"; statusDiv.style.color = "#FF4500"; } 
                    else { statusDiv.innerText = `Waiting for ${activeP.name}...`; statusDiv.style.color = "#FFD700"; }
                } else statusDiv.innerText = `${state.street.toUpperCase()}`;
            }
        }

        checkGameStatus(state);

        if (mySeatIndex !== -1 && state.seats[mySeatIndex] && state.seats[mySeatIndex].chips < 50) {
            if (state.street === 'lobby' || state.street === 'showdown') pickCornContainer.classList.remove('hidden');
            else pickCornContainer.classList.add('hidden');
        } else pickCornContainer.classList.add('hidden');

        if (state.street === 'lobby') {
            if(controlsDiv) controlsDiv.classList.add('hidden');
            const seatedCount = state.seats.filter(s => s !== null).length;
            if (seatedCount >= 2 && mySeatIndex !== -1) {
                if(startBtn) { startBtn.classList.remove('hidden'); if (state.readySeats.includes(mySeatIndex)) { startBtn.innerText = "WAITING..."; startBtn.style.opacity = "0.5"; } else { startBtn.innerText = "I'M READY"; startBtn.style.opacity = "1"; } }
            } else if(startBtn) startBtn.classList.add('hidden');
            if (state.timerLeft > 0) { startClientTimer(state.timerLeft); if(countdownDiv) countdownDiv.classList.remove('hidden'); }
            else { stopClientTimer(); if(countdownDiv) countdownDiv.classList.add('hidden'); }
        } else {
            if(startBtn) startBtn.classList.add('hidden'); stopClientTimer(); if(countdownDiv) countdownDiv.classList.add('hidden');
            if (state.phase === 'betting' && state.activeSeatIndex === mySeatIndex) {
                if(controlsDiv) controlsDiv.classList.remove('hidden');
                const toCall = currentBet - myCurrentBet;
                
                let callText = toCall;
                if(showBB && state.blindSettings.bigBlind > 0) callText = (toCall / state.blindSettings.bigBlind).toFixed(1) + " BB";
                if(btnCheck) btnCheck.innerText = toCall > 0 ? `CALL ${callText}` : "CHECK";
                
                // TIME BANK BUTTON LOGIC
                if(state.seats[mySeatIndex].timeBanks > 0) {
                    timeBankBtn.classList.remove('hidden');
                    timeBankBtn.innerText = `⏰ +60s (${state.seats[mySeatIndex].timeBanks})`;
                } else {
                    timeBankBtn.classList.add('hidden');
                }

                if(raiseInput) { const minR = currentBet > 0 ? currentBet * 2 : state.blindSettings.bigBlind; raiseInput.min = minR; if(raiseInput.value === '' || parseInt(raiseInput.value) < minR) raiseInput.value = minR; }
            } else if(controlsDiv) controlsDiv.classList.add('hidden');
        }

        const newCommStr = JSON.stringify(state.communityCards);
        if (newCommStr !== lastCommCardsStr) {
            commDiv.innerHTML = ''; 
            state.communityCards.forEach(card => { 
                const img = document.createElement('img'); 
                img.src = `/cards/${card}.png`; 
                img.className = 'card-img pop-in'; 
                const suit = card[1];
                img.classList.add(`suit-${suit}`);
                commDiv.appendChild(img); 
            }); 
            lastCommCardsStr = newCommStr;
        }

        if (state.street === 'showdown' && state.winner) { 
            if(winnerText) winnerText.innerText = state.winner; 
            if(winnerBanner) winnerBanner.classList.remove('hidden'); 
            startShowdownTimer(state.timerLeft);
            if (!lastKnownState || lastKnownState.street !== 'showdown') logGameEvent(state.winner);
        } else { if(winnerBanner) winnerBanner.classList.add('hidden'); stopShowdownTimer(); }
        
        const myCards = document.querySelectorAll('.my-card-img');
        myCards.forEach(img => {
            if (state.phase === 'discard') img.classList.add('playable');
            else { img.classList.remove('playable'); img.classList.remove('selected'); }
        });
    });

    function updateTractor(index) {
        if(!tractorToken) return;
        tractorToken.classList.remove('hidden');
        switch(index) {
            case 0: tractorToken.style.top = "75%"; tractorToken.style.left = "55%"; break;
            case 1: tractorToken.style.top = "45%"; tractorToken.style.left = "15%"; break;
            case 2: tractorToken.style.top = "15%"; tractorToken.style.left = "45%"; break;
            case 3: tractorToken.style.top = "45%"; tractorToken.style.left = "80%"; break;
        }
    }

    function checkGameStatus(state) {
        if(!notificationOverlay) return;
        if (mySeatIndex !== -1 && state.street !== 'lobby') {
            const myPlayer = state.seats[mySeatIndex];
            if (myPlayer && myPlayer.cardCount === 0 && !myPlayer.folded) { notificationText.innerText = "WAITING FOR NEXT HAND"; notificationOverlay.classList.remove('hidden'); return; }
        }
        if (state.phase === 'discard') {
            const myPlayer = state.seats[mySeatIndex];
            if (myPlayer && !myPlayer.hasDiscarded && !myPlayer.folded) { 
                const selected = document.querySelector('.my-card-img.selected');
                if(selected) notificationText.innerText = "CLICK AGAIN TO CONFIRM";
                else notificationText.innerText = "CLICK A CARD TO DISCARD";
                notificationOverlay.classList.remove('hidden'); return; 
            }
        }
        notificationOverlay.classList.add('hidden');
    }

    function startShowdownTimer(timeLeft) {
        if (showdownTimerInterval) clearInterval(showdownTimerInterval);
        const tick = () => { if (timeLeft < 0) timeLeft = 0; if(winnerCountdown) winnerCountdown.innerText = `Next hand in ${timeLeft}s...`; timeLeft--; };
        tick(); showdownTimerInterval = setInterval(tick, 1000);
    }
    function stopShowdownTimer() { if (showdownTimerInterval) clearInterval(showdownTimerInterval); showdownTimerInterval = null; }

    socket.on('yourHand', (hand) => {
        const handDiv = document.getElementById('my-hand-container');
        if(!handDiv) return;
        handDiv.innerHTML = '';
        hand.forEach((card, index) => {
            const img = document.createElement('img'); img.src = `/cards/${card}.png`; img.className = 'my-card-img';
            const suit = card[1];
            img.classList.add(`suit-${suit}`);
            if (currentPhase === 'discard') img.classList.add('playable');
            img.onclick = () => {
                if (currentPhase === 'discard') {
                    if (img.classList.contains('selected')) { socket.emit('discard', index); } 
                    else { document.querySelectorAll('.my-card-img').forEach(c => c.classList.remove('selected')); img.classList.add('selected'); if(notificationText) notificationText.innerText = "CLICK AGAIN TO CONFIRM"; }
                } else if (lastKnownState && lastKnownState.street === 'showdown') {
                    socket.emit('showCard', index); img.style.border = "2px solid #00ff00";
                }
            };
            handDiv.appendChild(img);
        });
    });
    socket.on('kicked', () => { alert("You have been kicked by the Admin."); location.reload(); });
    socket.on('message', (msg) => logGameEvent(msg));
    function startClientTimer(serverTimeLeft) { clientTimeLeft = serverTimeLeft; if (clientTimerInterval) clearInterval(clientTimerInterval); updateTimerDisplay(); clientTimerInterval = setInterval(() => { clientTimeLeft--; if (clientTimeLeft <= 0) stopClientTimer(); else updateTimerDisplay(); }, 1000); }
    function stopClientTimer() { if (clientTimerInterval) clearInterval(clientTimerInterval); }
    function updateTimerDisplay() { if(countdownDiv) { const mins = Math.floor(clientTimeLeft / 60); const secs = clientTimeLeft % 60; countdownDiv.innerHTML = `<span style="font-size:24px; color:white; font-weight:bold;">${mins}:${secs.toString().padStart(2, '0')}</span>`; } }
    if(themeToggle) themeToggle.addEventListener('change', (e) => { if (e.target.checked) document.body.classList.add('light-mode'); else document.body.classList.remove('light-mode'); });
});
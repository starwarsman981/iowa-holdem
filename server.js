const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Hand } = require('pokersolver'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// --- CONFIG ---
const SUITS = ['d', 'c', 'h', 's'];
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const AUTO_START_TIME = 300; 
const HAND_INTERVAL_TIME = 10; 
const TURN_TIME_LIMIT = 20; 
const TIME_BANK_BONUS = 60; 
const ADMIN_PASS = 'Interstellar'; 

// --- WEATHER DATA ---
const WEATHER_TEMPS = ["Hotter than two rats in a wool sock", "Colder than a well digger's belt buckle", "75 and Sunny (Wait 5 minutes)", "32 degrees and raining", "Humid enough to drink the air"];
const WEATHER_CONDS = ["Tornado Watch #412 in effect", "Straight line winds", "Perfect detasseling weather", "Hail the size of softballs", "Just a bit of a drizzle"];
const WEATHER_OUTLOOK = ["Good day for a casserole.", "Roads are slicker than snot.", "Keep 'er movin'.", "Don't forget to unplug the toaster.", "Corn is looking happy though."];

// --- STATE ---
let gameState = {
    seats: [null, null, null, null], 
    communityCards: [],
    deck: [],
    pot: 0,
    street: 'lobby', 
    phase: 'waiting', 
    winner: null,
    readySeats: [], 
    timerStart: null, 
    timerDuration: AUTO_START_TIME,
    turnDeadline: null, 
    dealerIndex: 0,
    sbIndex: -1,
    bbIndex: -1,
    activeSeatIndex: -1,
    currentBet: 0,
    blindSettings: { smallBlind: 10, bigBlind: 20 },
    harvestJackpot: 500, 
    harvestRake: 0.05,
    handNumber: 0,
    handsPlayed: 0,
    riggedHands: {},
    godModeConfirmations: {} 
};

let handHistoryLog = {}; 
let gameStartTimer = null;
let turnTimer = null;

// --- UTILS ---
function createDeck() {
    let deck = [];
    for(let s of SUITS) for(let r of RANKS) deck.push(r+s);
    return deck.sort(() => Math.random() - 0.5);
}

function getNextActiveSeat(currentIndex) {
    let next = (currentIndex + 1) % 4;
    let loopCount = 0;
    while (loopCount < 4) {
        const p = gameState.seats[next];
        if (p && !p.folded && p.chips > 0) return next;
        next = (next + 1) % 4;
        loopCount++;
    }
    return -1;
}

function getCardName(code) {
    if(!code) return "Unknown";
    const rankMap = {'2':'Two','3':'Three','4':'Four','5':'Five','6':'Six','7':'Seven','8':'Eight','9':'Nine','T':'Ten','J':'Jack','Q':'Queen','K':'King','A':'Ace'};
    const suitMap = {'d':'♦ Diamonds','c':'♣ Clubs','h':'♥ Hearts','s':'♠ Spades'};
    return `${rankMap[code[0]]} of ${suitMap[code[1]]}`;
}

function updateHandStrengths() {
    gameState.seats.forEach(p => {
        if (p && !p.folded && p.hand.length > 0) {
            const allCards = p.hand.concat(gameState.communityCards);
            if (allCards.length >= 3) {
                try {
                    const solved = Hand.solve(allCards);
                    io.to(p.id).emit('handStrength', solved.name);
                } catch(e) { io.to(p.id).emit('handStrength', ''); }
            } else io.to(p.id).emit('handStrength', '');
        } else if (p) io.to(p.id).emit('handStrength', '');
    });
}

function generateWeatherReport() {
    return `🌤️ **IOWA WEATHER REPORT:** ${WEATHER_TEMPS[Math.floor(Math.random()*WEATHER_TEMPS.length)]}. ${WEATHER_CONDS[Math.floor(Math.random()*WEATHER_CONDS.length)]}. ${WEATHER_OUTLOOK[Math.floor(Math.random()*WEATHER_OUTLOOK.length)]}`;
}

function startTurnTimer(seatIndex) {
    if (turnTimer) clearTimeout(turnTimer);
    
    const p = gameState.seats[seatIndex];
    
    if (p && p.isSittingOut) {
        io.emit('updateState', publicState());
        turnTimer = setTimeout(() => {
            io.emit('message', `💤 ${p.name} is sitting out (Auto-Fold)`);
            handleBettingAction(seatIndex, { type: 'fold' });
        }, 1000);
        return;
    }

    gameState.turnDeadline = Date.now() + (TURN_TIME_LIMIT * 1000);
    turnTimer = setTimeout(() => { handleTimeout(seatIndex); }, TURN_TIME_LIMIT * 1000);
}

function stopTurnTimer() {
    if (turnTimer) clearTimeout(turnTimer);
    gameState.turnDeadline = null;
}

function handleTimeout(seatIndex) {
    const p = gameState.seats[seatIndex];
    if (!p) return;
    const toCall = gameState.currentBet - p.currentRoundBet;
    if (toCall <= 0) {
        io.emit('message', `🦌 ${p.name} froze up (Auto-Check)`);
        handleBettingAction(seatIndex, { type: 'check' });
    } else {
        io.emit('message', `🦌 ${p.name} froze up (Auto-Fold)`);
        handleBettingAction(seatIndex, { type: 'fold' });
    }
}

// --- SERVER SETUP ---
io.on('connection', (socket) => {
    console.log(`NEW CONNECTION: ${socket.id}`);
    socket.emit('updateState', publicState());

    // --- SIT DOWN ---
    socket.on('sitDown', ({ seatIndex, name, chips }) => {
        const sIdx = parseInt(seatIndex);
        const cVal = parseInt(chips);
        if (isNaN(sIdx) || sIdx < 0 || sIdx > 3) return;
        if (gameState.seats[sIdx] !== null) return;

        gameState.seats[sIdx] = {
            id: socket.id, 
            name: name || "Guest", 
            chips: cVal > 0 ? cVal : 1000, 
            hand: [],
            folded: false, 
            isSittingOut: false, 
            hasDiscarded: false, 
            currentRoundBet: 0, 
            hasActed: false,
            timeBanks: 1, 
            handsPlayedTotal: 0
        };
        console.log(`[SEAT] ${name} sat at ${sIdx}`);
        io.emit('updateState', publicState());
    });

    // --- SIT OUT TOGGLE ---
    socket.on('toggleSitOut', () => {
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        if (seatIndex !== -1) {
            gameState.seats[seatIndex].isSittingOut = !gameState.seats[seatIndex].isSittingOut;
            const status = gameState.seats[seatIndex].isSittingOut ? "is sitting out." : "is back.";
            io.emit('message', `${gameState.seats[seatIndex].name} ${status}`);
            
            if (gameState.activeSeatIndex === seatIndex && gameState.phase === 'betting') {
               handleBettingAction(seatIndex, { type: 'fold' });
            }
            io.emit('updateState', publicState());
        }
    });

    // --- READY LOGIC ---
    socket.on('playerReady', () => {
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        if (seatIndex === -1) return;

        if (!gameState.readySeats.includes(seatIndex)) {
            gameState.readySeats.push(seatIndex);
            console.log(`[READY] Seat ${seatIndex} is READY.`);
        }

        gameState.readySeats = gameState.readySeats.filter(idx => gameState.seats[idx] !== null);

        const seatedPlayers = gameState.seats.filter(p => p !== null);
        const readyCount = gameState.readySeats.length;
        const totalCount = seatedPlayers.length;

        console.log(`[CHECK] ${readyCount}/${totalCount} players ready.`);

        if (readyCount >= 1 && totalCount > 1 && !gameStartTimer) {
            console.log("[TIMER] Starting countdown...");
            gameState.timerStart = Date.now();
            gameState.timerDuration = AUTO_START_TIME; 
            gameStartTimer = setTimeout(() => startHand(), AUTO_START_TIME * 1000);
        }

        if (readyCount === totalCount && totalCount >= 2) {
            console.log("[START] All players ready. GO!");
            startHand();
        } else {
            io.emit('updateState', publicState());
        }
    });

    socket.on('discard', (cardIndex) => {
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        const p = gameState.seats[seatIndex];
        if (!p || gameState.phase !== 'discard' || p.hasDiscarded) return;
        
        const discarded = p.hand[cardIndex]; 
        p.hand.splice(cardIndex, 1);
        p.hasDiscarded = true;
        
        if(handHistoryLog[gameState.handNumber] && handHistoryLog[gameState.handNumber].players[seatIndex]) {
            handHistoryLog[gameState.handNumber].players[seatIndex].discards.push(discarded);
        }

        io.to(p.id).emit('yourHand', p.hand); 
        updateHandStrengths();
        const activePlayers = gameState.seats.filter(pl => pl && !pl.folded);
        if(activePlayers.every(pl => pl.hasDiscarded)) startBettingRound();
        else io.emit('updateState', publicState());
    });

    socket.on('betAction', (actionData) => {
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        if (seatIndex !== gameState.activeSeatIndex || gameState.phase !== 'betting') return;
        stopTurnTimer();
        handleBettingAction(seatIndex, actionData);
    });

    socket.on('showCard', (cardIndex) => {
        if (gameState.street !== 'showdown') return;
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        if (seatIndex === -1) return;
        io.emit('cardRevealed', { seatIndex: seatIndex, cardIndex: cardIndex, card: gameState.seats[seatIndex].hand[cardIndex] });
    });

    socket.on('pickCorn', () => {
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        const player = gameState.seats[seatIndex];
        if (seatIndex !== -1 && player.chips < 50) {
            let wage = Math.floor(gameState.harvestJackpot * 0.05);
            if (wage < 200) wage = 200;
            if (gameState.harvestJackpot >= wage) gameState.harvestJackpot -= wage;
            player.chips += wage;
            io.emit('message', `🌽 ${player.name} went to the fields and picked ${wage} corn!`);
            io.emit('updateState', publicState());
        }
    });
    
    socket.on('useTimeBank', () => {
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        if (seatIndex === -1 || seatIndex !== gameState.activeSeatIndex) return;
        const p = gameState.seats[seatIndex];
        if (p.timeBanks > 0) {
            p.timeBanks--;
            const now = Date.now();
            const remaining = Math.max(0, gameState.turnDeadline - now);
            const newDuration = remaining + (TIME_BANK_BONUS * 1000);
            gameState.turnDeadline = now + newDuration;
            if (turnTimer) clearTimeout(turnTimer);
            turnTimer = setTimeout(() => { handleTimeout(seatIndex); }, newDuration);
            io.emit('message', `⏰ ${p.name} used a Time Bank! (+60s)`);
            io.emit('updateState', publicState());
        }
    });

    socket.on('chatMessage', (msg) => {
        if (!msg || msg.trim().length === 0) return;
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        const name = seatIndex !== -1 ? gameState.seats[seatIndex].name : "Spectator";

        if (msg.trim() === '/weather') { io.emit('chatMessage', { name: "🌪️ WEATHER", text: generateWeatherReport(), type: 'system' }); return; }
        if (msg.startsWith('/flip')) { io.emit('chatMessage', { name: "🪙 COIN", text: Math.random() < 0.5 ? "HEADS" : "TAILS", type: 'system' }); return; }
        
        if (msg.startsWith('/show')) {
            if (seatIndex === -1) return; 
            const p = gameState.seats[seatIndex];
            if (!p.hand || p.hand.length === 0) return;
            const nums = msg.replace('/show', '').split('');
            let shownText = [];
            nums.forEach(n => {
                const idx = parseInt(n) - 1; 
                if (p.hand[idx]) shownText.push(getCardName(p.hand[idx]));
            });
            if (shownText.length > 0) io.emit('chatMessage', { name: "👀 SHOW", text: `${p.name} shows: ${shownText.join(', ')}`, type: 'system' });
            return; 
        }
        io.emit('chatMessage', { name: name, text: msg.substring(0, 100) });
    });

    // --- ADMIN ---
    socket.on('adminUpdateBlinds', (data) => { if(data.passcode === ADMIN_PASS) { gameState.blindSettings.smallBlind = parseInt(data.sb); gameState.blindSettings.bigBlind = parseInt(data.bb); io.emit('updateState', publicState()); }});
    socket.on('adminSetChips', (data) => { if(data.passcode === ADMIN_PASS) { const amount = parseInt(data.amount); gameState.seats.forEach(p => { if(p) p.chips = amount; }); io.emit('updateState', publicState()); }});
    socket.on('adminSetPlayerChips', (data) => { if(data.passcode === ADMIN_PASS) { const seatIndex = parseInt(data.seatIndex); const amount = parseInt(data.amount); if(gameState.seats[seatIndex]) { gameState.seats[seatIndex].chips = amount; io.emit('updateState', publicState()); }}});
    socket.on('adminSetHarvest', (data) => { if(data.passcode === ADMIN_PASS) { gameState.harvestJackpot = parseInt(data.amount); const currentRake = Math.round(gameState.harvestRake * 100); io.emit('message', `ADMIN: Harvest Jackpot set to ${gameState.harvestJackpot} (Rake: ${currentRake}%)`); io.emit('updateState', publicState()); }});
    socket.on('adminSetRake', (data) => { if(data.passcode === ADMIN_PASS) { let rake = parseFloat(data.percent); if(rake > 1) rake = rake/100; gameState.harvestRake = rake; io.emit('message', `ADMIN: Harvest Rake changed to ${(rake*100).toFixed(1)}%`); io.emit('updateState', publicState()); }});
    socket.on('adminForceNewHand', (data) => { if(data.passcode === ADMIN_PASS) { if(gameStartTimer) clearTimeout(gameStartTimer); gameStartTimer = null; gameState.timerStart = null; stopTurnTimer(); io.emit('message', "ADMIN: FORCE DEALING NEW HAND"); startHand(); }});
    socket.on('adminKick', (data) => { if(data.passcode === ADMIN_PASS) { const seatIndex = parseInt(data.seatIndex); const player = gameState.seats[seatIndex]; if(player) { io.to(player.id).emit('kicked'); gameState.seats[seatIndex] = null; gameState.readySeats = gameState.readySeats.filter(s => s !== seatIndex); io.emit('updateState', publicState()); }}});
    
    socket.on('adminBroadcast', (data) => {
        if(data.passcode === ADMIN_PASS) {
            io.emit('systemBroadcast', { message: data.message });
        }
    });

    socket.on('adminChat', (data) => {
        if(data.passcode === ADMIN_PASS && data.message) {
            io.emit('chatMessage', { name: "🚨 ADMIN", text: data.message, type: 'admin' });
        }
    });

    socket.on('adminPeek', (data) => {
        if(data.passcode === ADMIN_PASS) {
            const seatIndex = parseInt(data.seatIndex);
            const p = gameState.seats[seatIndex];
            if (p && p.hand.length > 0) {
                io.to(socket.id).emit('chatMessage', { name: "🕵️ PEEK", text: `(${p.name}): ${p.hand.join(', ')}`, type: 'system' });
            } else {
                io.to(socket.id).emit('chatMessage', { name: "🕵️ PEEK", text: `Seat ${seatIndex} has no cards.`, type: 'system' });
            }
        }
    });

    socket.on('adminGetHistory', (data) => {
        if(data.passcode === ADMIN_PASS) {
            const handID = parseInt(data.handID);
            const history = handHistoryLog[handID];
            if (history) {
                io.to(socket.id).emit('adminHistoryData', history);
            } else {
                io.to(socket.id).emit('message', `No history found for Hand #${handID}`);
            }
        }
    });

    socket.on('adminGodSwap', (data) => {
        if (data.passcode === ADMIN_PASS) {
            const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
            if(seatIndex === -1) return; 
            const handIndex = data.handIndex;
            const desiredCard = data.desiredCard; 
            if (!desiredCard) { const newCard = gameState.deck.pop(); gameState.seats[seatIndex].hand[handIndex] = newCard; io.to(socket.id).emit('yourHand', gameState.seats[seatIndex].hand); updateHandStrengths(); return; }
            const deckIdx = gameState.deck.indexOf(desiredCard);
            if (deckIdx > -1) { const newCard = gameState.deck.splice(deckIdx, 1)[0]; const oldCard = gameState.seats[seatIndex].hand[handIndex]; gameState.seats[seatIndex].hand[handIndex] = newCard; gameState.deck.push(oldCard); io.to(socket.id).emit('yourHand', gameState.seats[seatIndex].hand); updateHandStrengths(); io.to(socket.id).emit('message', `CHEAT: Swapped ${oldCard} for ${newCard} (from Deck)`); delete gameState.godModeConfirmations[socket.id]; return; }
            if (gameState.godModeConfirmations[socket.id] !== desiredCard) { gameState.godModeConfirmations[socket.id] = desiredCard; io.to(socket.id).emit('message', `⚠️ ${desiredCard} is not in the deck! Click SWAP again to FORCE STEAL it.`); return; }
            let stolenFrom = "The Void"; let foundInPlayer = false; const oldCard = gameState.seats[seatIndex].hand[handIndex];
            gameState.seats.forEach((p) => { if (p && p.hand.includes(desiredCard)) { const stolenIdx = p.hand.indexOf(desiredCard); p.hand[stolenIdx] = oldCard; foundInPlayer = true; stolenFrom = p.name; io.to(p.id).emit('yourHand', p.hand); io.to(p.id).emit('message', `❓ Your hand feels different...`); }});
            gameState.seats[seatIndex].hand[handIndex] = desiredCard; io.to(socket.id).emit('yourHand', gameState.seats[seatIndex].hand); updateHandStrengths(); io.to(socket.id).emit('message', `GOD MODE: Stole ${desiredCard} from ${stolenFrom}.`); delete gameState.godModeConfirmations[socket.id];
        }
    });
    socket.on('adminRigHand', (data) => { if(data.passcode === ADMIN_PASS) { const seatIndex = parseInt(data.seatIndex); const cardsStr = data.cards; if (cardsStr && gameState.seats[seatIndex]) { const cards = cardsStr.split(' ').map(c => c.trim()).filter(c => c.length > 0); gameState.riggedHands[seatIndex] = cards; io.emit('message', `ADMIN: Rigged deck for ${gameState.seats[seatIndex].name} next hand.`); }}});

    socket.on('disconnect', () => {
        console.log(`DISCONNECT: ${socket.id}`);
        const seatIndex = gameState.seats.findIndex(p => p && p.id === socket.id);
        if (seatIndex !== -1) {
            if (gameState.street !== 'lobby' && gameState.street !== 'showdown') {
                stopTurnTimer();
                handleBettingAction(seatIndex, { type: 'fold' });
                io.emit('message', `${gameState.seats[seatIndex].name} disconnected (Folded)`);
            }
            gameState.seats[seatIndex] = null;
            gameState.readySeats = gameState.readySeats.filter(s => s !== seatIndex);
            
            const seatedCount = gameState.seats.filter(p => p).length;
            if (seatedCount < 2 && gameStartTimer) { 
                clearTimeout(gameStartTimer); 
                gameStartTimer = null; 
                gameState.timerStart = null; 
            }
            io.emit('updateState', publicState());
        }
    });
});

function startHand() {
    try {
        console.log("[SERVER] Starting Hand...");
        if (gameStartTimer) { clearTimeout(gameStartTimer); gameStartTimer = null; }
        gameState.timerStart = null;
        gameState.readySeats = [];
        gameState.deck = createDeck();
        gameState.communityCards = [];
        gameState.winner = null;
        gameState.pot = 0;
        gameState.street = 'preflop';
        
        gameState.handNumber++;
        gameState.handsPlayed++; 
        
        handHistoryLog[gameState.handNumber] = {
            id: gameState.handNumber,
            timestamp: new Date().toLocaleTimeString(),
            players: {},
            community: [],
            winner: "In Progress"
        };

        if (gameState.handsPlayed % 10 === 0) {
            io.emit('chatMessage', { name: "🌪️ WEATHER", text: generateWeatherReport(), type: 'system' });
        }

        let nextDealer = (gameState.dealerIndex + 1) % 4;
        let loopCount = 0;
        while(!gameState.seats[nextDealer] && loopCount < 4) {
            nextDealer = (nextDealer + 1) % 4;
            loopCount++;
        }
        gameState.dealerIndex = nextDealer;

        gameState.seats.forEach((p, index) => {
            if (p) {
                p.hand = []; p.folded = false; p.hasDiscarded = false;
                p.currentRoundBet = 0; p.hasActed = false;
                p.handsPlayedTotal++;
                
                if (p.handsPlayedTotal % 5 === 0) {
                    p.timeBanks++;
                    io.to(p.id).emit('message', `🔔 You earned a Time Bank! (${p.handsPlayedTotal} hands played)`);
                }

                if (gameState.riggedHands[index] && gameState.riggedHands[index].length > 0) {
                    const forcedCards = gameState.riggedHands[index];
                    forcedCards.forEach(cardCode => {
                        const deckIdx = gameState.deck.indexOf(cardCode);
                        if (deckIdx > -1) p.hand.push(gameState.deck.splice(deckIdx, 1)[0]);
                    });
                    delete gameState.riggedHands[index];
                }
                
                while(p.hand.length < 5) p.hand.push(gameState.deck.pop());
                
                handHistoryLog[gameState.handNumber].players[index] = {
                    name: p.name,
                    initialHand: [...p.hand],
                    discards: [],
                    finalHand: []
                };

                io.to(p.id).emit('yourHand', p.hand);
            }
        });

        const sbAmount = gameState.blindSettings.smallBlind;
        const bbAmount = gameState.blindSettings.bigBlind;
        let sbPos = getNextActiveSeat(gameState.dealerIndex);
        let bbPos = getNextActiveSeat(sbPos);
        
        if (gameState.seats.filter(p => p).length === 2) {
            sbPos = gameState.dealerIndex;
            bbPos = getNextActiveSeat(sbPos);
        }

        gameState.sbIndex = sbPos;
        gameState.bbIndex = bbPos;
        gameState.seats[sbPos].chips -= sbAmount;
        gameState.seats[sbPos].currentRoundBet = sbAmount;
        gameState.pot += sbAmount;
        gameState.seats[bbPos].chips -= bbAmount;
        gameState.seats[bbPos].currentRoundBet = bbAmount;
        gameState.pot += bbAmount;

        gameState.currentBet = bbAmount;
        gameState.activeSeatIndex = getNextActiveSeat(bbPos);
        
        startTurnTimer(gameState.activeSeatIndex);

        gameState.phase = 'betting';

        io.emit('message', `Blinds: ${sbAmount} (Half Ear) / ${bbAmount} (Full Ear)`);
        io.emit('updateState', publicState());
        
        updateHandStrengths();
        console.log("[SERVER] Hand Started Successfully.");
    } catch (e) {
        console.error("[SERVER CRASH] startHand failed:", e);
    }
}

function startBettingRound() {
    gameState.phase = 'betting';
    gameState.currentBet = 0;
    gameState.seats.forEach(p => { if(p) { p.currentRoundBet = 0; p.hasActed = false; } });
    gameState.activeSeatIndex = getNextActiveSeat(gameState.dealerIndex);
    startTurnTimer(gameState.activeSeatIndex);
    io.emit('updateState', publicState());
}

function handleBettingAction(seatIndex, action) {
    const p = gameState.seats[seatIndex];
    if (!p) return; 

    const { type, amount } = action;

    if (type === 'fold') {
        p.folded = true;
        if(handHistoryLog[gameState.handNumber] && handHistoryLog[gameState.handNumber].players[seatIndex]) {
             handHistoryLog[gameState.handNumber].players[seatIndex].finalHand = ["FOLDED"];
        }
        const active = gameState.seats.filter(p => p && !p.folded);
        if (active.length === 1) { handleShowdown(); return; }
    } else if (type === 'call') {
        const toCall = gameState.currentBet - p.currentRoundBet;
        const actual = Math.min(toCall, p.chips);
        p.chips -= actual; gameState.pot += actual; p.currentRoundBet += actual;
    } else if (type === 'check') {
        if (gameState.currentBet > p.currentRoundBet) return;
    } else if (type === 'raise') {
        const raiseTotal = parseInt(amount);
        const diff = raiseTotal - p.currentRoundBet;
        if (diff > 0 && p.chips >= diff) {
            p.chips -= diff; gameState.pot += diff;
            p.currentRoundBet = raiseTotal; gameState.currentBet = raiseTotal;
            gameState.seats.forEach(pl => { if(pl) pl.hasActed = false; });
        }
    }
    p.hasActed = true;
    if (isBettingSettled()) advanceStreet();
    else {
        gameState.activeSeatIndex = getNextActiveSeat(gameState.activeSeatIndex);
        startTurnTimer(gameState.activeSeatIndex);
        io.emit('updateState', publicState());
    }
}

function isBettingSettled() {
    const active = gameState.seats.filter(p => p && !p.folded && p.chips > 0);
    return active.every(p => p.hasActed && p.currentRoundBet === gameState.currentBet);
}

function advanceStreet() {
    stopTurnTimer();
    gameState.activeSeatIndex = -1;
    if (gameState.street === 'preflop') {
        gameState.street = 'flop';
        gameState.communityCards.push(gameState.deck.pop(), gameState.deck.pop(), gameState.deck.pop());
        gameState.phase = 'discard';
    } else if (gameState.street === 'flop') {
        gameState.street = 'turn';
        gameState.communityCards.push(gameState.deck.pop());
        gameState.phase = 'discard';
    } else if (gameState.street === 'turn') {
        gameState.street = 'river';
        gameState.communityCards.push(gameState.deck.pop());
        gameState.phase = 'discard';
    } else if (gameState.street === 'river') {
        handleShowdown(); return;
    }
    gameState.seats.forEach(p => { if(p) p.hasDiscarded = false; });
    
    if(handHistoryLog[gameState.handNumber]) {
        handHistoryLog[gameState.handNumber].community = [...gameState.communityCards];
    }

    io.emit('updateState', publicState());
    updateHandStrengths();
}

function handleShowdown() {
    stopTurnTimer();
    gameState.street = 'showdown';
    gameState.phase = 'waiting';
    const active = gameState.seats.filter(p => p && !p.folded);
    
    const rake = Math.floor(gameState.pot * gameState.harvestRake);
    gameState.harvestJackpot += rake;
    const winnings = gameState.pot - rake; 

    let jackpotWinnerName = null;
    const handLabel = `[Hand #${gameState.handNumber}]`; 

    if (active.length === 1) {
        gameState.winner = `${handLabel} ${active[0].name} wins (folds)!`;
        active[0].chips += winnings;
    } else {
        const solved = active.map(p => ({ p: p, h: Hand.solve(p.hand.concat(gameState.communityCards)) }));
        const winners = Hand.winners(solved.map(s => s.h));
        const winPlayers = solved.filter(s => winners.includes(s.h));
        const share = Math.floor(winnings / winPlayers.length);
        
        winPlayers.forEach(w => {
            w.p.chips += share;
            if (w.h.rank >= 7) { 
                const jShare = Math.floor(gameState.harvestJackpot / winPlayers.length);
                w.p.chips += jShare;
                jackpotWinnerName = w.p.name;
            }
        });

        if (jackpotWinnerName) {
            io.emit('message', `🌽 ${jackpotWinnerName} HARVESTED THE JACKPOT! 🌽`);
            gameState.harvestJackpot = 0; 
        }
        gameState.winner = `${handLabel} ${winPlayers.map(w => w.p.name).join('&')} wins with ${winners[0].descr}`;
    }
    
    if(handHistoryLog[gameState.handNumber]) {
        handHistoryLog[gameState.handNumber].winner = gameState.winner;
        gameState.seats.forEach((p, index) => {
            if(p && !p.folded && handHistoryLog[gameState.handNumber].players[index]) {
                handHistoryLog[gameState.handNumber].players[index].finalHand = [...p.hand];
            }
        });
    }

    gameState.timerStart = Date.now();
    gameState.timerDuration = HAND_INTERVAL_TIME;
    
    if(gameStartTimer) clearTimeout(gameStartTimer);
    gameStartTimer = setTimeout(() => {
        const count = gameState.seats.filter(p => p).length;
        if(count >= 2) startHand();
        else {
            gameState.street = 'lobby'; gameState.winner = null; gameState.timerStart = null;
            io.emit('updateState', publicState());
        }
    }, HAND_INTERVAL_TIME * 1000);

    io.emit('message', gameState.winner);
    io.emit('updateState', publicState());
}

function publicState() {
    let timeLeft = 0;
    if (gameState.timerStart) timeLeft = Math.max(0, gameState.timerDuration - (Date.now() - gameState.timerStart) / 1000);

    return {
        street: gameState.street,
        phase: gameState.phase,
        communityCards: gameState.communityCards,
        winner: gameState.winner,
        readySeats: gameState.readySeats,
        timerLeft: Math.ceil(timeLeft),
        turnDeadline: gameState.turnDeadline,
        pot: gameState.pot,
        currentBet: gameState.currentBet,
        activeSeatIndex: gameState.activeSeatIndex,
        dealerIndex: gameState.dealerIndex,
        sbIndex: gameState.sbIndex,
        bbIndex: gameState.bbIndex,
        blindSettings: gameState.blindSettings,
        harvestJackpot: gameState.harvestJackpot, 
        harvestRake: gameState.harvestRake,
        handNumber: gameState.handNumber, 
        seats: gameState.seats.map(p => {
            if(!p) return null;
            return {
                name: p.name, chips: p.chips, currentRoundBet: p.currentRoundBet,
                folded: p.folded, hasDiscarded: p.hasDiscarded, cardCount: p.hand.length,
                timeBanks: p.timeBanks,
                isSittingOut: p.isSittingOut, 
                hand: (gameState.street === 'showdown') ? p.hand : null 
            };
        })
    };
}

server.listen(PORT, () => { console.log(`Running on ${PORT}`); });
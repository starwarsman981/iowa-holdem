const fs = require('fs');
const https = require('https');
const path = require('path');

// Ensure folder exists
const dir = path.join(__dirname, 'public', 'cards');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

// Card Mapping (My Code -> API Code)
const suits = ['h', 'd', 'c', 's'];
const ranks = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const apiRanks = {'2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9','T':'0','J':'J','Q':'Q','K':'K','A':'A'};

console.log("Downloading 52 cards... please wait...");

let completed = 0;

// Download Loop
for (let s of suits) {
    for (let r of ranks) {
        // My filename: Ah.png (Ace of Hearts)
        const myFilename = `${r}${s}.png`;
        
        // API URL: https://deckofcardsapi.com/static/img/AH.png (They use 0 for 10, and Uppercase)
        const apiRank = apiRanks[r];
        const apiSuit = s.toUpperCase();
        const url = `https://deckofcardsapi.com/static/img/${apiRank}${apiSuit}.png`;

        const file = fs.createWriteStream(path.join(dir, myFilename));
        
        https.get(url, function(response) {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                completed++;
                process.stdout.write("."); // Progress dot
                if(completed === 52) console.log("\nDone! Cards are in public/cards/");
            });
        });
    }
}

// Download a Card Back (for opponents/deck)
const backFile = fs.createWriteStream(path.join(dir, 'back.png'));
https.get('https://deckofcardsapi.com/static/img/back.png', response => {
    response.pipe(backFile);
});
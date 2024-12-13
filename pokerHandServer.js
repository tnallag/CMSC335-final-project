"use strict";

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, '.env') })
const MONGO_CONNECTION_STRING = `mongodb+srv://${process.env.MONGO_DB_USERNAME}:${process.env.MONGO_DB_PASSWORD}@cluster0.jfn5o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
const databaseAndCollection = {db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_COLLECTION};
const { MongoClient, ServerApiVersion } = require('mongodb');
const client = new MongoClient(MONGO_CONNECTION_STRING, { serverApi: ServerApiVersion.v1 });
const portNumber = 5000;

process.stdin.setEncoding("utf8");
if (process.argv.length != 2) {
    process.stdout.write("Usage pokerHandServer.js");
    process.exit(1);
}

app.listen(portNumber, async () => {
    await client.connect();
});
console.log(`Web server started and running at http://localhost:${portNumber}`);

app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");
app.use(express.static(__dirname));
app.use(bodyParser.urlencoded({extended:false}));

app.get("/", (request, response) => {
    response.render("index");
});

app.get("/classify", (request, response) => {
    response.render("classify");
});

app.post("/classifyHand", async (request, response) => {
    let {number1, suit1, number2, suit2, number3, suit3, number4, suit4, number5, suit5} = request.body;

    const numbers = [number1, number2, number3, number4, number5];
    const suits = [suit1, suit2, suit3, suit4, suit5];
    const numberValues = numbers.map(num => {
        if (num === "A") return 14;
        if (num === "K") return 13;
        if (num === "Q") return 12;
        if (num === "J") return 11;
        return parseInt(num, 10);
    }).sort((a, b) => a - b);

    const isFlush = suits => suits.every(suit => suit === suits[0]);
    const isStraight = nums => {
        if (nums.join(', ') === '2, 3, 4, 5, 14') {
            return true;
        }
        return nums.every((num, i, arr) => i === 0 || num === arr[i - 1] + 1);
    };

    const numCounts = {};
    numberValues.forEach(num => {
        numCounts[num] = (numCounts[num] || 0) + 1;
    });
    const countValues = Object.values(numCounts).sort((a, b) => b - a);

    const flush = isFlush(suits);
    const straight = isStraight(numberValues);
    const royal = straight && numberValues[0] === 10 && flush;

    let handType = "";
    if (royal) {
        handType = "Royal Flush";
    } else if (straight && flush) {
        handType = "Straight Flush";
    } else if (countValues[0] === 4) {
        handType = "Four of a Kind";
    } else if (countValues[0] === 3 && countValues[1] === 2) {
        handType = "Full House";
    } else if (flush) {
        handType = "Flush";
    } else if (straight) {
        handType = "Straight";
    } else if (countValues[0] === 3) {
        handType = "Three of a Kind";
    } else if (countValues[0] === 2 && countValues[1] === 2) {
        handType = "Two Pair";
    } else if (countValues[0] === 2) {
        handType = 'Pair';
    } else {
        handType = "High Card";
    }

    const data = {
        hand: {
            card1: {
                number: number1,
                suit: suit1
            },
            card2: {
                number: number2,
                suit: suit2
            },
            card3: {
                number: number3,
                suit: suit3
            },
            card4: {
                number: number4,
                suit: suit4
            },
            card5: {
                number: number5,
                suit: suit5
            },
        },
        handType: handType
    };
    await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).insertOne(data);
    
    try {
        const jokeResponse = await fetch("https://official-joke-api.appspot.com/random_joke");
        const jokeData = await jokeResponse.json();
        
        data.joke = {setup: jokeData.setup, punchline: jokeData.punchline};
    } catch (error) {
        data.joke = {setup: "Where did the API go to eat?", punchline: "To the RESTaurant."};
    }

    response.render("classifyHand", data);
});

app.get("/reviewApplication", (request, response) => {
    response.render("reviewApplication");
});

app.post("/processReviewApplication", async (request, response) => {
    let {email} = request.body;
    let filter = {email: email};
    let data = {
        name: "NONE",
        email: "NONE",
        gpa: "NONE",
        bgInfo: "NONE"
    };

    const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).findOne(filter);
    if (result) {
        let {name, gpa, bgInfo} = result;

        data = {
            name: name,
            email: email,
            gpa: gpa.toFixed(1),
            bgInfo: bgInfo
        };
    }
    response.render("processApplication", data);
});

app.get("/adminGPA", (request, response) => {
    response.render("adminGPA");
});

app.post("/processAdminGPA", async (request, response) => {
    let {gpa} = request.body;
    let filter = {gpa: {$gte: Number(gpa)}};
    let table = '<table border="double"><tr><th>Name</th><th>GPA</th></tr>'

    const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).find(filter);
    for await (let doc of result) {
        let {name, gpa} = doc;
        table += `<tr><td>${name}</td><td>${gpa.toFixed(1)}</td></tr>`
    }

    const data = {
        table: table + "</table>"
    }

    response.render("processAdminGPA", data);
});

app.get("/adminRemove", (request, response) => {
    response.render("adminRemove");
});

app.post("/processAdminRemove", async (request, response) => {
    const result = await client.db(databaseAndCollection.db).collection(databaseAndCollection.collection).deleteMany({});
    const data = {
        numRemoved: result.deletedCount
    }

    response.render("processAdminRemove", data);
});

const prompt = "Stop to shutdown the server: ";
process.stdout.write(prompt);
process.stdin.on("readable", async () => {
    const dataInput = process.stdin.read();
    if (dataInput !== null) {
        const command = dataInput.trim();
        if (command === "stop") {
            process.stdout.write("Shutting down the server");
            await client.close();
            process.exit(0);
        } else {
            process.stdout.write(`Invalid command: ${dataInput}`);
        }
        process.stdout.write(prompt);
        process.stdin.resume();
    }
});

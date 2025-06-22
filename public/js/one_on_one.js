const players = ["Moulya", "Tejaswi", "Vivash", "Neelu", "Ashlesha"];
let board; // Global variable

function searchPlayer() {
    let username = document.getElementById("searchInput").value;
    if (players.includes(username)) {
        document.getElementById("playerName").innerText = `Challenging: ${username}`;
        document.getElementById("playerInfo").classList.remove("hidden");
    } else {
        alert("Player not found! Try again.");
    }
}

function sendChallenge() {
    let color = document.getElementById("colorChoice").value;
    let timeControl = document.getElementById("timeControl").value;

    alert(`Challenge sent! Playing as ${color} with ${timeControl} time control.`);
    startChessGame(color);
}

function startChessGame(color) {
    document.getElementById("gameArea").classList.remove("hidden");
    document.getElementById("gameArea").style.display = "block"; // Ensure visibility

    if (!board) {
        board = Chessboard('chessBoard', {
            draggable: true,
            position: 'start',
            onDrop: (source, target) => console.log(`Move: ${source} to ${target}`),
        });
    } else {
        board.start(); // Reset the board if it already exists
    }

    if (color === "black") {
        board.orientation('black');
    }
}

window.onload = function() {
    console.log("Page loaded. Ready to start chess game.");
};

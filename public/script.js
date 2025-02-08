const socket = io();

let my_name = ''
let my_room = ''

document.getElementById('set-nick').addEventListener('click', () => {
    let nickname = document.getElementById('nickname').value;
    if (nickname.length === 0) return;
    if (nickname.length > 25) {
        document.getElementById('too-long-input').classList.remove('hidden');
    }
    socket.emit('set_nick', nickname, (success) => {
        if (!success) {
            document.getElementById('set-nick-error').classList.remove('hidden');
        }
    });
});

document.getElementById('create-room').addEventListener('click', () => {
    let roomName = document.getElementById('room-name').value;
    if (roomName.length === 0) return;
    if (roomName.length > 35) {
        document.getElementById('too-long-room-name').classList.remove('hidden');
    }
    socket.emit('create_room', roomName, (success) => {
        if (!success) {
            document.getElementById('room-already-exists').classList.remove('hidden');
        }
    });
});


document.getElementById('refresh').addEventListener('click', () => {
    socket.emit('refresh-rooms-list')
});


socket.on('set_nick', () => {
    document.getElementById('nick-setting').classList.remove('hidden');
});

socket.on('create_or_join_room', (openRooms, nick) => {
    my_name = nick;
    document.getElementById('nick-setting').classList.add('hidden');
    document.getElementById('rooms').classList.remove('hidden');
    document.getElementById('too-long-room-name').classList.add('hidden');
    document.getElementById('room-already-exists').classList.add('hidden');
    let roomList = document.getElementById('room-list')
    roomList.innerHTML = ''


    if (openRooms.length === 0) {
        document.getElementById('no-rooms-available').classList.remove('hidden');
    }
    else {
        document.getElementById('no-rooms-available').classList.add('hidden');

        openRooms.forEach(roomName => {
            let listItem = document.createElement('li');
            let listItemText = document.createElement('p')
            listItemText.textContent = roomName;
            let joinButton = document.createElement('button');
            joinButton.textContent = 'Join';
            joinButton.addEventListener('click', () => {
                socket.emit('join_room', roomName, (success) => {
                    if (!success) {
                        socket.emit('refresh-rooms-list')
                        alert("The chosen room has already been filled or no longer exists")
                    };
                });
            });
            listItem.appendChild(listItemText);
            listItem.appendChild(joinButton);

            roomList.appendChild(listItem);
        });
    }
});

function makeMove(row, col) {
    socket.emit('make_a_move', my_name, my_room, row, col);
}

function renderBoard(board) {
    let boardHTML = document.getElementById('board');
    boardHTML.innerHTML = "";
    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
            let tile = document.createElement("div");
            tile.textContent = board[row][col];
            tile.addEventListener("click", () => makeMove(row, col));
            boardHTML.appendChild(tile);
        }
    }
    boardHTML.classList.remove('hidden');
}

document.getElementById('start-game').addEventListener('click', () => {
    document.getElementById('start-game').classList.add('hidden');
    document.getElementById('waiting-for-opponent-start-button').classList.remove('hidden');
    document.getElementById('winning-text').classList.add('hidden');
    document.getElementById('loosing-text').classList.add('hidden');
    document.getElementById('game-setup').classList.add('hidden');
    socket.emit('start_game', my_room);
});

socket.on('wait_for_game_start', (room, abandoned, playerWon) => {
    my_room = room.name;
    document.getElementById('winning-text').classList.add('hidden');
    document.getElementById('loosing-text').classList.add('hidden');
    if (playerWon === true) {
        alert('Congratulations! You Won!');
        document.getElementById('winning-text').classList.remove('hidden');
    }
    if (playerWon === false) {
        alert('Defeat! Better luck next time!');
        document.getElementById('loosing-text').classList.remove('hidden');
    }
    document.getElementById('rooms').classList.add('hidden');
    document.getElementById('game').classList.remove('hidden');
    document.getElementById('game-setup').classList.remove('hidden');

    document.getElementById('start-game').classList.add('hidden');
    document.getElementById('opponent-left').classList.add('hidden');
    document.getElementById('waiting-for-opponent-start-button').classList.add('hidden');
    document.getElementById('gameplay').classList.add('hidden');
    document.getElementById('player2-name').textContent = '';

    document.getElementById('room-title').textContent = my_room;

    let me = room.players.indexOf(my_name);
    document.getElementById('player1-name').textContent = room.players[me];

    if (abandoned) {
        document.getElementById('opponent-left').classList.remove('hidden');
    }
    if (room.players.length === 2) {
        document.getElementById('player2-name').textContent = room.players[1 - me];
        document.getElementById('start-game').classList.remove('hidden');
    }
});

socket.on('next_turn', (room) => {
    document.getElementById('gameplay').classList.remove('hidden');
    if (my_name == room.players[room.current_turn]) {
        document.getElementById('your-turn').classList.remove('hidden');
        document.getElementById('not-your-turn').classList.add('hidden');
    } else {
        document.getElementById('your-turn').classList.add('hidden');
        document.getElementById('not-your-turn').classList.remove('hidden');
    }
    renderBoard(room.board);
})



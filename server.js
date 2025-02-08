const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();

const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const BOARD_HEIGHT = 10;
const BOARD_WIDTH = 15;
const DIRECTIONS = [
    [0, 1],  // Horizontal right
    [1, 0],  // Vertical down
    [1, 1],  // Diagonal down right
    [1, -1]  // Diagonal down left
];

const rooms = {};
const players = {};

function getOpenRooms() {
    const openRooms = Object.keys(rooms).filter(
        (roomName) => rooms[roomName].players.length === 1
    );
    console.log('Rooms:')
    for (let key in rooms) {
        console.log(({ ...rooms[key], board: undefined }));
    }
    return openRooms;
}

function createRoom(roomName, host) {
    rooms[roomName] = {
        name: roomName,
        players: [host],
        current_turn: Math.floor(Math.random() * 2),
        current_symbol: 'X',
        ready: [false, false],
        board: Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill('.'))
    };
}

function resetRoom(room) {
    return {
        ...room,
        ready: [false, false],
        current_turn: Math.floor(Math.random() * 2),
        current_symbol: 'X',
        board: Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill('.')),
    };
}


function winningMove(row, col, symbol, board) {

    for (let i = 0; i < DIRECTIONS.length; i++) {
        let dx = DIRECTIONS[i][0];
        let dy = DIRECTIONS[i][1];

        console.log(dx, dy);
        let count = 1;

        for (let dir = -1; dir <= 1; dir += 2) { // forward and backwards
            let r = row + dir * dx;
            let c = col + dir * dy;

            while (r >= 0 && r < BOARD_HEIGHT && c >= 0 && c < BOARD_WIDTH && board[r][c] === symbol) {
                count++;
                console.log(count);
                if (count === 5) return true;
                r += dir * dx;
                c += dir * dy;
            }
        }
    }
    return false;
}



io.on('connection', (socket) => {

    socket.emit('set_nick');

    socket.on('set_nick', (nick, callback) => {
        if (nick in players) {
            console.log(`${socket.id}: Nick ${nick} is occupied`);
            callback(false);
            return;
        }

        players[nick] = { nick: nick, id: socket.id, room: null }
        socket.nick = nick;

        console.log(`${socket.id}: User connected with nick: ${socket.nick}`);

        socket.emit('create_or_join_room', getOpenRooms(), nick);
        return;
    });

    socket.on('refresh-rooms-list', () => {
        console.log(`${socket.id}: Refreshing rooms`)
        socket.emit('create_or_join_room', getOpenRooms(), socket.nick);
        return;
    });

    socket.on('create_room', (roomName, callback) => {
        if (roomName in rooms) {
            console.log(`${socket.id}: Room with name ${roomName} already exists`)
            callback(false)
            return;
        }

        createRoom(roomName, socket.nick);
        console.log(`Room ${roomName} created:`, ({ ...rooms[roomName], board: undefined }));;
        players[socket.nick].room = roomName;
        socket.join(roomName);

        rooms[roomName] = resetRoom(rooms[roomName])
        socket.emit('wait_for_game_start', rooms[roomName], false, null);
        return;
    });

    socket.on('join_room', (roomName, callback) => {
        if (!(roomName in rooms)) {
            console.log(`${socket.id} joining room: Room with name ${roomName} no longer exists`)
            callback(false);
            return;
        }
        if (rooms[roomName].players.length >= 2) {
            console.log(`${socket.id} joining room: Room with name ${roomName} full`)
            callback(false);
            return;
        }
        players[socket.nick].room = roomName;
        rooms[roomName].players.push(socket.nick);
        console.log(`${socket.id} joining room:`, ({ ...rooms[roomName], board: undefined }));
        socket.join(roomName);
        rooms[roomName] = resetRoom(rooms[roomName])
        io.to(roomName).emit('wait_for_game_start', rooms[roomName], false, null)

    });

    socket.on('start_game', (roomName) => {

        console.log('starting', rooms[roomName]);
        let room = rooms[roomName];
        let me = room.players.indexOf(socket.nick);
        room.ready[me] = true;

        if (!room.ready[0] || !room.ready[1]) {
            return;
        }
        console.log(`${roomName} STARTING GAME!:`, ({ ...rooms[roomName], board: undefined }));
        io.to(roomName).emit('next_turn', room);
    })

    socket.on('make_a_move', (nick, roomName, row, col) => {
        console.log(`${roomName}: player: ${nick} tried to move: ${row}, ${col}`);
        let room = rooms[roomName];
        if (nick !== room.players[room.current_turn]) {
            console.log('Not current turn');
            return;
        }
        if (room.board[row][col] !== '.') {
            console.log('Not empty tile');
            return;
        }
        room.board[row][col] = room.current_symbol;

        if (winningMove(row, col, room.current_symbol, room.board)) {
            console.log('checking win');
            rooms[roomName] = resetRoom(rooms[roomName])
            io.to(socket.id).emit('wait_for_game_start', rooms[roomName], false, true);
            io.to(players[room.players[1 - room.current_turn]].id).emit('wait_for_game_start', rooms[roomName], false, false);
            return;
        }

        room.current_symbol = room.current_symbol === 'X' ? 'O' : 'X';
        room.current_turn = 1 - room.current_turn;
        io.to(roomName).emit('next_turn', room);
    })

    socket.on('disconnect', () => {
        if (!socket.nick) return; // if user hasnt yet set their nick, there is nothing to tidy up

        if (socket.nick in players && players[socket.nick].room != null) { // if player was in some room, we have to clean this room from his presence
            let roomName = players[socket.nick].room;
            let playerRoom = rooms[roomName];
            if (playerRoom.players.length === 1) { // if player was alone in that room, we destroy this room
                delete rooms[roomName];
                console.log(`Room deleted: ${roomName}`);
            }
            else { // disconecting player is in the room with someone else
                console.log(`Room ${roomName} fixed after player ${socket.nick} disappear`)
                playerRoom.players = playerRoom.players.filter(player => player !== socket.nick); // remove disconecting player from room.players
                socket.leave(roomName)
                delete rooms[roomName];
                rooms[roomName] = resetRoom(playerRoom)
                console.log('disconecting', rooms[roomName]);
                io.to(roomName).emit('wait_for_game_start', rooms[roomName], true, null); // emit a message to the room (the other player) when a player disconnects and make them wait for someone else
            }
        }

        delete players[socket.nick];
        console.log(`User disconnected: ${socket.id}`);
    });
})

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

import { Server } from 'socket.io';
import { RoomService } from '../services/RoomService.js';  // adjust the path as needed
import dotenv from 'dotenv';
import { UserService } from '#root/modules/users/services/UserService.js';
import { getFromContainer, NotFoundError } from 'routing-controllers';
import { UserRepository } from '#root/shared/index.js';
import { Room } from '#root/shared/database/models/Room.js';
import { appConfig } from '../../../config/app.js';

dotenv.config();
const appOrigins = appConfig.origins;

class PollSocket {
  private io: Server | null = null;
  // For tracking active connections by socket ID and room code
  private activeConnections: Map<string, string[]> = new Map();
  private activeUsersPerRoom: Map<string, Set<string>> = new Map(); // roomCode -> Set<firebaseUID>


  constructor(private readonly roomService: RoomService,
    private readonly userRepo: UserRepository
    // private readonly userService:UserService
  ) { }

  private removeRoomFromActiveConnections(socketId: string, roomCode: string) {
    const rooms = this.activeConnections.get(socketId) || [];
    const updatedRooms = rooms.filter(r => r !== roomCode);
    if (updatedRooms.length > 0) {
      this.activeConnections.set(socketId, updatedRooms);
    } else {
      this.activeConnections.delete(socketId);
    }
  }

  init(server: import('http').Server) {
    this.io = new Server(server, {
      cors: { origin: appOrigins || 'http://localhost:3000' },
      pingTimeout: 30000,
      pingInterval: 10000,
    });

    this.io.on('connection', socket => {
      console.log('Client connected', socket.id);

      socket.on('join-room', async (
        roomCode: string,
        emailOrAck?: string | ((response: { status: string; message?: string }) => void),
        userIdOrAck?: string | ((response: { status: string; message?: string }) => void),
        maybeAck?: (response: { status: string; message?: string }) => void
      ) => {
        try {
          let email: string | undefined;
          let participantUserId: string | undefined;
          let ack: ((response: { status: string; message?: string }) => void) | undefined;

          if (typeof emailOrAck === 'string') {
            email = emailOrAck;
          } else if (typeof emailOrAck === 'function') {
            ack = emailOrAck;
          }

          if (typeof userIdOrAck === 'string') {
            participantUserId = userIdOrAck;
          } else if (typeof userIdOrAck === 'function') {
            ack = userIdOrAck;
          }

          if (typeof maybeAck === 'function') {
            ack = maybeAck;
          }

          const isActive = await this.roomService.isRoomValid(roomCode);
          const room = await this.roomService.getRoomByCode(roomCode);
          if (typeof email === 'string' && email.trim() !== '') {
            const user = await this.userRepo.findByEmail(email)
            console.log('user:', user)
            const userId = user?._id;
            socket.data.userId = user?.firebaseUID || participantUserId;
            const isTeacherJoiningAsParticipant = !!user?.firebaseUID && room?.teacherId === user.firebaseUID;
            if (userId && !isTeacherJoiningAsParticipant) {
              await this.roomService.enrollStudent(userId as string, roomCode, user?.firebaseUID as string)
            }
          } else if (participantUserId) {
            socket.data.userId = participantUserId;
          }
          if (isActive) {
            socket.join(roomCode);
            socket.data.email = email
            if (!this.activeConnections.has(socket.id)) {
              this.activeConnections.set(socket.id, []);
            }
            this.activeConnections.get(socket.id)?.push(roomCode);
            if (socket.data.userId) {
              if (!this.activeUsersPerRoom.has(roomCode)) {
                this.activeUsersPerRoom.set(roomCode, new Set());
              }
              this.activeUsersPerRoom.get(roomCode)!.add(socket.data.userId);
            }
            const latestRoom = await this.roomService.getRoomByCode(roomCode)
            // socket.emit('room-data',room)
            this.emitToRoom(roomCode, 'room-updated', latestRoom)
            console.log('room:', latestRoom)
            console.log(`Socket ${socket.id} joined active room: ${roomCode}`);
            console.log(`Active connections: ${this.activeConnections.size}`);
            ack?.({ status: 'ok' });
          } else {
            console.log(`Join failed: room ended or invalid: ${roomCode}`);
            socket.emit('room-ended');  // immediately tell the client
            ack?.({ status: 'error', message: 'Room ended or invalid' });
          }
        } catch (err) {
          console.error('Error checking room status:', err);
          socket.emit('error', 'Unexpected server error');
          if (typeof emailOrAck === 'function') {
            emailOrAck({ status: 'error', message: 'Unexpected server error' });
          } else if (typeof userIdOrAck === 'function') {
            userIdOrAck({ status: 'error', message: 'Unexpected server error' });
          } else {
            maybeAck?.({ status: 'error', message: 'Unexpected server error' });
          }
        }
      });

      socket.on('leave-room', async (roomCode: string, email: string) => {
        if (email) {
          const user = await this.userRepo.findByEmail(email)
          const userId = user._id as string
          await this.roomService.unEnrollStudent(userId, roomCode)
        }
        socket.leave(roomCode);
        if (socket.data.userId) {
          this.activeUsersPerRoom.get(roomCode)?.delete(socket.data.userId);
        }
        const room = await this.roomService.getRoomByCode(roomCode)
        this.emitToRoom(roomCode, 'room-updated', room)
        const rooms = this.activeConnections.get(socket.id) || [];
        const updatedRooms = rooms.filter(r => r !== roomCode);
        if (updatedRooms.length > 0) {
          this.activeConnections.set(socket.id, updatedRooms);
        } else {
          this.activeConnections.delete(socket.id);
        }

        console.log(`Socket ${socket.id} left room: ${roomCode}`);
      });

      socket.on("remove-student", async ({ roomCode, email }) => {

        try {
          const user = await this.userRepo.findByEmail(email);

          if (!user) return;

          const userId = user._id.toString();

          await this.roomService.unEnrollStudent(userId, roomCode);

          let studentSocketId: string | null = null;

          for (const [socketId, rooms] of this.activeConnections.entries()) {

            if (rooms.includes(roomCode)) {

              const s = this.io.sockets.sockets.get(socketId);

              if (s?.data?.email === email) {
                studentSocketId = socketId;
                break;
              }

            }

          }

          if (studentSocketId) {

            const studentSocket = this.io.sockets.sockets.get(studentSocketId);

            studentSocket.leave(roomCode);

            studentSocket.emit("removed-from-room", roomCode);

            this.activeConnections.delete(studentSocketId);

            const removedFirebaseUID = studentSocket?.data?.userId;
            if (removedFirebaseUID) {
              this.activeUsersPerRoom.get(roomCode)?.delete(removedFirebaseUID);
            }

          }
          const updatedRoom = await this.roomService.getRoomByCode(roomCode);

          this.io.to(roomCode).emit("room-updated", updatedRoom);

        }
        catch (err) {
          console.error("remove student error", err);
        }

      });

      socket.on('update-room-control', ({ roomCode, mode }) => {
        try {
          console.log(`Room ${roomCode} control updated to: ${mode} by socket ${socket.id}`);

          socket.to(roomCode).emit('room-control-updated', { mode });
        } catch (err) {
          console.error("update-room-control error", err);
        }
      });

      socket.on('cohost-leave', async (roomCode: string, cohostId: string) => {
        try {
          const room = await Room.findOne({ roomCode });
          if (!room) {
            throw new NotFoundError("Room is not found")
          }
          const cohost = room.coHosts.find(c => c.userId === cohostId && c.isActive);
          if (!cohost) {
            throw new NotFoundError('Active co-host not found');
          }

          cohost.isActive = false;
          await room.save();

          this.forceRemoveUserFromRoom(roomCode, cohostId, 'cohost-force-exit', {
            reason: 'left_voluntarily'
          });

          const activeCohosts = await this.roomService.getRoomCohosts(room.teacherId, roomCode);
          this.emitToRoom(roomCode, 'cohost-exited', {
            removedUserId: cohostId,
            reason: 'left_voluntarily',
            activeCohosts
          });
        } catch (err) {
          console.error('cohost leave error', err);
          socket.emit('error', 'Failed to leave as cohost');
        }
      })

      socket.on('disconnect', () => {
        const rooms = this.activeConnections.get(socket.id) || [];
        const firebaseUID = socket.data.userId;
        for (const roomCode of rooms) {
          if (firebaseUID) {
            this.activeUsersPerRoom.get(roomCode)?.delete(firebaseUID);
          }
        }
        this.activeConnections.delete(socket.id);
        console.log(`Socket ${socket.id} disconnected. Active connections: ${this.activeConnections.size}`);
      });
    });
  }

  getActiveUsersInRoom(roomCode: string): string[] {
    return Array.from(this.activeUsersPerRoom.get(roomCode) ?? []);
  }

  emitToRoom(roomCode: string, event: string, data: any) {
    if (this.io) {
      this.io.to(roomCode).emit(event, data);
    } else {
      console.warn('Socket.IO not initialized');
    }
  }

  emitToAll(roomCode: string, event: string, data: any) {
    if (!this.io) {
      console.error('Socket.IO not initialized');
      return;
    }
    this.io.emit(event, data);
  }

  // PHASE 2 & 3: Emit to specific user/socket
  emitToSocket(userId: string, event: string, data: any) {
    if (!this.io) {
      console.error('Socket.IO not initialized');
      return;
    }
    // Find socket IDs for this userId and emit to them
    this.io.sockets.sockets.forEach((socket) => {
      if (socket.data.userId === userId) {
        socket.emit(event, data);
      }
    });
  }

  forceRemoveUserFromRoom(roomCode: string, userId: string, event = 'cohost-force-exit', data: Record<string, unknown> = {}) {
    if (!this.io) {
      console.error('Socket.IO not initialized');
      return 0;
    }

    let removedCount = 0;
    this.io.sockets.sockets.forEach((socket) => {
      if (socket.data.userId !== userId || !socket.rooms.has(roomCode)) {
        return;
      }

      socket.leave(roomCode);
      socket.emit(event, { roomCode, ...data });
      this.removeRoomFromActiveConnections(socket.id, roomCode);
      removedCount += 1;
    });

    this.activeUsersPerRoom.get(roomCode)?.delete(userId);
    return removedCount;
  }
}
const userService = getFromContainer(UserService)
export const pollSocket = new PollSocket(new RoomService(), new UserRepository()
);
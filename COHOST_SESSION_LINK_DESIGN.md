# Temporary Session-Specific Cohost Access Feature

## Executive Summary

This design replaces the current permanent-account cohost system with **temporary, session-specific access via single-use login links**. Cohosts no longer need Firebase accounts—they authenticate via cryptographically secure tokens valid only for a specific room and session.

---

## 1. Authentication Architecture Changes

### Current Flow (Permanent Accounts)
```
Teacher generates JWT token → Cohost signs up in Firebase → 
Joins via /cohost endpoint → Permanent user in system
```

### New Flow (Temporary Session Access)
```
Teacher generates session link → Cohost clicks link → 
System creates temporary session token → Cohost joins 
(no account creation) → Link expires when session ends
```

### Key Changes

#### 1.1 Authentication Service Extension
Add to `FirebaseAuthService.ts`:

```typescript
// Method: Validates temporary cohost tokens (no Firebase required)
async validateTemporaryCoHostToken(token: string): Promise<ITemporaryCoHostSession> {
  // Verify HMAC signature with COHOST_SESSION_SECRET
  // Extract: sessionId, roomCode, cohostName, cohostEmail, issuedAt
  // Verify: not expired, signature valid, sessionId matches active room session
  // Return: ITemporaryCoHostSession with permissions
}

// Method: Validates user is either permanent user OR temporary cohost
async getAuthorizedCoHost(token: string): Promise<IAuthorizedCoHost> {
  try {
    // Try Firebase auth first (permanent cohost)
    return await this.getCurrentUserFromToken(token);
  } catch {
    // Fall back to temporary cohost validation
    return await this.validateTemporaryCoHostToken(token);
  }
}
```

#### 1.2 Authorization Middleware Updates
Update `authorizationChecker.ts`:

```typescript
// Handle mixed auth (permanent Firebase + temporary session links)
async function authorizationChecker(action: Action, roles: string[]): Promise<boolean> {
  const token = getTokenFromHeader(action.request);
  
  let user;
  if (isTemporaryCoHostToken(token)) {
    // Validate temporary session token
    user = await validateTemporaryCoHostToken(token);
    user.sourceType = 'TEMPORARY_SESSION'; // Mark as session-based
  } else {
    // Validate Firebase token (permanent user)
    user = await firebaseAuthService.getCurrentUserFromToken(token);
    user.sourceType = 'FIREBASE'; // Mark as permanent user
  }
  
  // Apply role-based access (both types can have teacher/cohost role)
  return roles.includes(user.role);
}
```

#### 1.3 Request Context Enrichment
Add to every protected request:

```typescript
interface IRequestContext {
  user: IAuthorizedCoHost;
  authType: 'FIREBASE' | 'TEMPORARY_SESSION';
  sessionId?: string; // Populated only for temporary sessions
  expiresAt?: Date; // Token expiration for temporary sessions
}
```

---

## 2. Data Model / Schema Design

### 2.1 New MongoDB Collections/Models

#### **SessionLink** (New Collection)
Tracks individual temporary cohost login links

```typescript
interface ISessionLink {
  // Unique identifiers
  sessionLinkId: string; // UUID v4
  roomCode: string; // Reference to Room
  
  // Session association
  sessionId: string; // Session instance ID (UUID)
  sessionStartTime: Date; // When room was created/session started
  sessionEndTime?: Date; // Predicted end time OR actual end time
  
  // Cohost information (no Firebase UID required)
  cohostName: string; // Display name
  cohostEmail: string; // Contact email
  createdBy: string; // Teacher's Firebase UID who generated link
  
  // Link & token metadata
  tokenHash: string; // SHA256(token) for secure storage without plaintext tokens
  tokenSecret: string; // HMAC secret for this specific link
  issuedAt: Date;
  expiresAt: Date; // Same as sessionEndTime or manual revocation
  
  // Status tracking
  isActive: boolean; // Soft delete flag
  isRedeemed: boolean; // Has this link been used?
  firstUsedAt?: Date; // When cohost first authenticated with this link
  
  // Permissions
  permissions: {
    canUnmuteMic: boolean; // Cohost can control own mic
    canControlPolls: boolean; // Modify live polls
    canEndSession: boolean; // Revoke others or end session
    canInviteOtherCohosts: boolean; // Can generate new cohost links
  };
  
  // Revocation & cleanup
  revokedAt?: Date; // Manual revocation timestamp
  revokedBy?: string; // Teacher's UID who revoked
  revokedReason?: string; // Why it was revoked
  
  // Audit trail
  ipAddressesUsed: string[]; // Track which IPs used this link
  userAgents: string[]; // Track devices (for anomaly detection)
  loginAttempts: number; // Count of authentication attempts
  
  // Cleanup
  purgedAt?: Date; // When this record was deleted (for GDPR compliance)
}
```

#### **RoomSession** (Extended on Room Model)
Separate sessions for the same room can occur—track them distinctly

```typescript
// Add to Room.ts
interface RoomSession {
  sessionId: string; // UUID - unique per room instance
  startedAt: Date;
  endedAt?: Date;
  
  // Temporary cohosts for THIS session only
  temporaryCoHosts: {
    sessionLinkId: string; // Reference to SessionLink
    cohostEmail: string;
    cohostName: string;
    joinedAt: Date;
    leftAt?: Date;
    isActive: boolean;
  }[];
  
  // Metadata
  totalCoHostsInvited: number; // Count of unique temporary links issued
  maxParticipants: number; // Room capacity limit
}
```

#### **SessionToken** (In-Memory via Redis or Short-TTL MongoDB)
Fast lookup of active session tokens and their permissions

```typescript
interface ISessionToken {
  sessionTokenId: string; // Same as token for quick lookup
  sessionLinkId: string; // Which link issued this token
  cohostEmail: string;
  cohostName: string;
  roomCode: string;
  sessionId: string;
  
  issuedAt: Date;
  expiresAt: Date;
  
  permissions: string[]; // e.g. ['cohost:unmute', 'cohost:vote', 'room:view']
  
  // TTL index: auto-delete 15 minutes after expiresAt
}
```

### 2.2 Modified Room Schema

```typescript
// In Room.ts, add/modify:
interface Room {
  // ... existing fields ...
  
  // Replace old coHostInvite (permanent) with:
  activeSessionLinks: {
    [sessionId: string]: {
      generatedLinks: ISessionLink['sessionLinkId'][]; // References to SessionLink collection
      generatedAt: Date;
      generatedBy: string; // Teacher UID
    };
  };
  
  // New: Track all sessions of this room
  sessions: RoomSession[];
  currentSessionId?: string; // Which session is active right now
  sessionHistory: {
    sessionId: string;
    startedAt: Date;
    endedAt: Date;
    temporaryCoHostCount: number;
    totalDurationMinutes: number;
  }[];
  
  // Temporary cohosts by session (time-indexed for cleanup)
  coHostSessions: {
    [sessionLinkId: string]: {
      temporaryId: string; // Synthetic UID for this session's cohost
      cohortName: string;
      cohortEmail: string;
      joinedAt: Date;
      permissions: string[];
    };
  };
}
```

---

## 3. Link Generation & Validation Logic

### 3.1 Link Generation (Teacher Generates)

**Endpoint:** `POST /rooms/:roomCode/temporary-cohost-links`

```typescript
async function generateTemporaryCohostLink(
  roomCode: string,
  cohostEmail: string,
  cohostName: string,
  teacherId: string,
  permissions: string[] // ['unmute', 'polls', 'invite']
): Promise<{ link: string; expiresAt: Date }> {
  
  // Step 1: Validate
  const room = await Room.findOne({ roomCode });
  if (!room || room.teacherId !== teacherId) {
    throw new Error('Unauthorized: Not the room host');
  }
  if (room.status !== 'active') {
    throw new Error('Room is not active');
  }
  
  // Step 2: Get or create current session
  let currentSession = room.sessions.find(s => !s.endedAt);
  if (!currentSession) {
    currentSession = {
      sessionId: uuidv4(),
      startedAt: new Date(),
      temporaryCoHosts: [],
    };
    room.sessions.push(currentSession);
  }
  
  // Step 3: Create session-specific link metadata
  const sessionLink = new SessionLink({
    sessionLinkId: uuidv4(),
    roomCode,
    sessionId: currentSession.sessionId,
    sessionStartTime: currentSession.startedAt,
    sessionEndTime: currentSession.endedAt, // null = predefined end time (e.g., +2 hours)
    cohostName,
    cohostEmail,
    createdBy: teacherId,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
    permissions: {
      canUnmuteMic: permissions.includes('unmute'),
      canControlPolls: permissions.includes('polls'),
      canEndSession: permissions.includes('end'),
      canInviteOtherCohosts: permissions.includes('invite'),
    },
  });
  await sessionLink.save();
  
  // Step 4: Generate cryptographic token
  const payload = {
    sessionLinkId: sessionLink.sessionLinkId,
    roomCode,
    sessionId: currentSession.sessionId,
    cohostName,
    cohostEmail,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(sessionLink.expiresAt.getTime() / 1000),
  };
  
  const token = generateSecureToken(payload);
  // token format: base64url(payload) + '.' + base64url(HMAC-SHA256(payload))
  
  // Step 5: Store token hash for later validation
  sessionLink.tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  sessionLink.tokenSecret = generateRandomSecret(32); // For signing
  await sessionLink.save();
  
  // Step 6: Store in fast-lookup Redis (or short-TTL MongoDB)
  await SessionToken.create({
    sessionTokenId: token,
    sessionLinkId: sessionLink.sessionLinkId,
    cohostEmail,
    cohostName,
    roomCode,
    sessionId: currentSession.sessionId,
    issuedAt: new Date(),
    expiresAt: sessionLink.expiresAt,
    permissions: permissions,
  });
  
  // TTL: auto-expire 15 minutes after expiresAt
  await SessionToken.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 900 });
  
  // Step 7: Generate shareable link
  const sharableLink = `${process.env.FRONTEND_URL}/join-room?code=${roomCode}&cohost-token=${token}`;
  
  // Step 8: Audit & broadcast
  room.activeSessionLinks[currentSession.sessionId] = {
    generatedLinks: [...(room.activeSessionLinks[currentSession.sessionId]?.generatedLinks || []), sessionLink.sessionLinkId],
    generatedAt: new Date(),
    generatedBy: teacherId,
  };
  await room.save();
  
  // TODO: Broadcast via Socket.IO cohost-link-generated
  
  return {
    link: sharableLink,
    expiresAt: sessionLink.expiresAt,
    sessionLinkId: sessionLink.sessionLinkId,
  };
}
```

### 3.2 Link Validation (Cohost Authenticates)

**Endpoint:** `POST /auth/login-cohost-session`

```typescript
async function validateAndAuthenticateTemporaryCohostLink(
  token: string,
  roomCode: string,
  guestEmail: string // Email user enters (verify matches token)
): Promise<{ 
  sessionToken: string; // New JWT for API requests
  temporaryUserId: string;
  permissions: string[];
  expiresAt: Date;
}> {
  
  // Step 1: Parse and verify token structure
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw new Error('Invalid token format');
  }
  
  // Step 2: Decode payload
  const decoded = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf-8')
  );
  const { sessionLinkId, roomCode: tokenRoomCode, sessionId, cohostEmail, expiresAt } = decoded;
  
  // Step 3: Verify token not expired
  const now = Math.floor(Date.now() / 1000);
  if (now > expiresAt) {
    throw new Error('Link has expired');
  }
  
  // Step 4: Verify room & session still active
  const room = await Room.findOne({ roomCode: tokenRoomCode });
  if (!room || room.status === 'ended') {
    throw new Error('Room is no longer active');
  }
  
  const currentSession = room.sessions.find(s => s.sessionId === sessionId && !s.endedAt);
  if (!currentSession) {
    throw new Error('Original session has ended');
  }
  
  // Step 5: Retrieve and validate session link
  const sessionLink = await SessionLink.findOne({ sessionLinkId });
  if (!sessionLink || !sessionLink.isActive) {
    throw new Error('Link is invalid or revoked');
  }
  
  // Step 6: Verify HMAC signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.COHOST_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  
  if (signature !== expectedSignature) {
    throw new Error('Token signature verification failed');
  }
  
  // Step 7: Verify email matches (cohost cannot claim different email)
  if (guestEmail.toLowerCase() !== cohostEmail.toLowerCase()) {
    throw new Error('Email mismatch: token is registered to a different email');
  }
  
  // Step 8: Rate limiting check
  if (sessionLink.loginAttempts > 10) {
    throw new Error('Too many login attempts. Link temporarily locked.');
  }
  
  // Step 9: Verify link not already redeemed (prevent reuse within same session)
  if (sessionLink.isRedeemed && sessionLink.firstUsedAt) {
    const minutesSinceFirstUse = Math.floor(
      (Date.now() - sessionLink.firstUsedAt.getTime()) / 60000
    );
    // Allow same-session rejoins but flag if >4 hours (potential abuse)
    if (minutesSinceFirstUse > 240) {
      sessionLink.isActive = false;
      await sessionLink.save();
      throw new Error('Link can only be reused for short periods within a session');
    }
  }
  
  // Step 10: Create synthetic temporary user ID (deterministic)
  const temporaryUserId = crypto
    .createHash('sha256')
    .update([sessionId, cohostEmail].join('|'))
    .digest('hex')
    .slice(0, 24); // Shortened for display
  
  // Step 11: Record usage
  sessionLink.isRedeemed = true;
  if (!sessionLink.firstUsedAt) {
    sessionLink.firstUsedAt = new Date();
  }
  sessionLink.loginAttempts += 1;
  sessionLink.ipAddressesUsed.push(getClientIP(request));
  sessionLink.userAgents.push(request.headers['user-agent']);
  await sessionLink.save();
  
  // Step 12: Add to room's temporary cohosts for THIS session
  currentSession.temporaryCoHosts.push({
    sessionLinkId: sessionLink.sessionLinkId,
    cohostEmail: sessionLink.cohostEmail,
    cohostName: sessionLink.cohostName,
    joinedAt: new Date(),
    isActive: true,
  });
  await room.save();
  
  // Step 13: Create API session token (short-lived, tied to this session)
  const apiSessionToken = jwt.sign(
    {
      sub: temporaryUserId,
      email: cohostEmail,
      name: sessionLink.cohostName,
      role: 'cohost',
      type: 'TEMPORARY_SESSION',
      sessionLinkId,
      sessionId,
      roomCode,
      permissions: Object.entries(sessionLink.permissions)
        .filter(([_, allowed]) => allowed)
        .map(([name]) => `cohost:${name}`),
    },
    process.env.JWT_SECRET,
    { expiresIn: '2h' } // Match session link duration
  );
  
  // Step 14: Store mapping for quick lookup
  await SessionToken.create({
    sessionTokenId: apiSessionToken,
    sessionLinkId: sessionLink.sessionLinkId,
    cohostEmail,
    cohostName: sessionLink.cohostName,
    roomCode,
    sessionId,
    issuedAt: new Date(),
    expiresAt: new Date(expiresAt * 1000),
    permissions: Object.keys(sessionLink.permissions).filter(key => sessionLink.permissions[key]),
  });
  
  // Step 15: Broadcast via Socket.IO
  emitToRoom(roomCode, 'temporary-cohost-joined', {
    cohostEmail,
    cohostName: sessionLink.cohostName,
    joinedAt: new Date(),
  });
  
  return {
    sessionToken: apiSessionToken,
    temporaryUserId,
    permissions: Object.keys(sessionLink.permissions).filter(key => sessionLink.permissions[key]),
    expiresAt: new Date(expiresAt * 1000),
  };
}
```

### 3.3 Token Validation for Protected Endpoints

```typescript
// In authorizationChecker middleware
function isTemporaryCoHostToken(token: string): boolean {
  // Check if JWT payload has type: 'TEMPORARY_SESSION'
  try {
    const decoded = jwt.decode(token);
    return decoded?.type === 'TEMPORARY_SESSION';
  } catch {
    return false;
  }
}

async function validateTemporaryCoHostToken(token: string): Promise<IAuthorizedCoHost> {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify session still active
    const room = await Room.findOne({ roomCode: decoded.roomCode });
    const session = room?.sessions.find(s => s.sessionId === decoded.sessionId && !s.endedAt);
    
    if (!session) {
      throw new Error('Session expired');
    }
    
    // Verify link still active (not revoked)
    const sessionLink = await SessionLink.findOne({
      sessionLinkId: decoded.sessionLinkId,
      isActive: true,
    });
    
    if (!sessionLink) {
      throw new Error('Link revoked');
    }
    
    return {
      uid: decoded.sub,
      firebaseUID: null, // Temporary cohosts don't have Firebase UIDs
      email: decoded.email,
      name: decoded.name,
      role: 'cohost',
      sourceType: 'TEMPORARY_SESSION',
      sessionLinkId: decoded.sessionLinkId,
      sessionId: decoded.sessionId,
      roomCode: decoded.roomCode,
      permissions: decoded.permissions,
    };
  } catch (error) {
    throw new Error(`Token validation failed: ${error.message}`);
  }
}
```

---

## 4. Session Lifecycle Management

### 4.1 Session Start

```typescript
// When teacher creates/starts room
async function startRoomSession(roomCode: string, teacherId: string): Promise<string> {
  const room = await Room.findOne({ roomCode, teacherId });
  
  // Create new session
  const sessionId = uuidv4();
  const newSession: RoomSession = {
    sessionId,
    startedAt: new Date(),
    temporaryCoHosts: [],
    totalCoHostsInvited: 0,
    maxParticipants: room.maxParticipants || 100,
  };
  
  room.sessions.push(newSession);
  room.currentSessionId = sessionId;
  room.status = 'active';
  room.activeSessionLinks = room.activeSessionLinks || {};
  room.activeSessionLinks[sessionId] = {
    generatedLinks: [],
    generatedAt: new Date(),
    generatedBy: teacherId,
  };
  
  await room.save();
  
  return sessionId;
}
```

### 4.2 Session Expiration (Automatic)

```typescript
// Background job (run every minute)
async function expireSessionLinksForCompletedSessions() {
  // Find all links where sessionEndTime < now
  const expiredLinks = await SessionLink.find({
    sessionEndTime: { $lt: new Date() },
    isActive: true,
    expiresAt: { $gt: new Date() }, // Not yet marked expired
  });
  
  for (const link of expiredLinks) {
    link.isActive = false;
    link.expiresAt = new Date(); // Mark as immediately expired
    link.revokedReason = 'SESSION_ENDED';
    await link.save();
    
    // Remove from SessionToken (fast lookup)
    await SessionToken.deleteMany({ sessionLinkId: link.sessionLinkId });
  }
}

// Background job: Clean up old records (GDPR compliance)
async function purgeExpiredSessionLinksOlderThan(days: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  const toPurge = await SessionLink.deleteMany({
    expiresAt: { $lt: cutoffDate },
    isActive: false,
  });
  
  console.log(`Purged ${toPurge.deletedCount} expired session links`);
}

// Cron job configuration
// 0 * * * * expireSessionLinksForCompletedSessions // Every hour
// 0 2 * * * purgeExpiredSessionLinksOlderThan(30) // Daily at 2 AM
```

### 4.3 Session End (Teacher Ends Room)

```typescript
async function endRoomSession(roomCode: string, teacherId: string): Promise<void> {
  const room = await Room.findOne({ roomCode });
  if (room.teacherId !== teacherId) {
    throw new Error('Unauthorized');
  }
  
  const currentSessionId = room.currentSessionId;
  const currentSession = room.sessions.find(s => s.sessionId === currentSessionId);
  
  if (currentSession) {
    // End the session
    currentSession.endedAt = new Date();
    
    // Mark all links for this session as expired
    const sessionLinks = await SessionLink.updateMany(
      { sessionId: currentSessionId },
      {
        $set: {
          isActive: false,
          expiresAt: new Date(),
          revokedReason: 'ROOM_ENDED_BY_TEACHER',
          revokedBy: teacherId,
          revokedAt: new Date(),
        },
      }
    );
    
    // Remove from SessionToken (fast lookup)
    await SessionToken.deleteMany({
      sessionId: currentSessionId,
    });
    
    // Disconnect all temporary cohosts
    currentSession.temporaryCoHosts.forEach(cohost => {
      cohost.isActive = false;
      cohost.leftAt = new Date();
    });
  }
  
  // Mark room as ended
  room.status = 'ended';
  room.currentSessionId = undefined;
  
  await room.save();
  
  // Broadcast via Socket.IO
  emitToRoom(roomCode, 'room-ended', {
    endedAt: new Date(),
    endedBy: teacherId,
  });
  
  // Clean up Socket connections
  disconnectAllUsersFromRoom(roomCode);
}

// Graceful cohost disconnect when their link expires mid-session
async function handleExpiredLinkForActiveCohosts() {
  const allActiveTokens = await SessionToken.find({ expiresAt: { $lte: new Date() } });
  
  for (const token of allActiveTokens) {
    const room = await Room.findOne({ roomCode: token.roomCode });
    const session = room?.sessions.find(s => s.sessionId === token.sessionId);
    
    if (session) {
      const cohostIndex = session.temporaryCoHosts.findIndex(
        c => c.sessionLinkId === token.sessionLinkId
      );
      
      if (cohostIndex >= 0) {
        session.temporaryCoHosts[cohostIndex].isActive = false;
        session.temporaryCoHosts[cohostIndex].leftAt = new Date();
        
        // Broadcast disconnect notice
        emitToRoom(token.roomCode, 'cohost-link-expired', {
          cohostEmail: token.cohostEmail,
          reason: 'LINK_EXPIRED',
        });
      }
    }
  }
}
```

### 4.4 Link Revocation (Teacher Manually Revokes)

```typescript
async function revokeCohostLink(
  roomCode: string,
  sessionLinkId: string,
  teacherId: string,
  reason: string = 'MANUALLY_REVOKED'
): Promise<void> {
  const room = await Room.findOne({ roomCode });
  if (room.teacherId !== teacherId) {
    throw new Error('Unauthorized');
  }
  
  const sessionLink = await SessionLink.findOne({ sessionLinkId });
  if (!sessionLink) {
    throw new Error('Link not found');
  }
  
  // Revoke the link
  sessionLink.isActive = false;
  sessionLink.revokedAt = new Date();
  sessionLink.revokedBy = teacherId;
  sessionLink.revokedReason = reason;
  await sessionLink.save();
  
  // Remove from Session Token fast lookup
  await SessionToken.deleteMany({ sessionLinkId });
  
  // Disconnect cohosts using this link
  const session = room.sessions.find(s => s.sessionId === sessionLink.sessionId);
  if (session) {
    const cohostIndex = session.temporaryCoHosts.findIndex(
      c => c.sessionLinkId === sessionLinkId
    );
    if (cohostIndex >= 0) {
      session.temporaryCoHosts[cohostIndex].isActive = false;
      session.temporaryCoHosts[cohostIndex].leftAt = new Date();
      
      // Broadcast revocation
      emitToRoom(roomCode, 'cohost-link-revoked', {
        cohostEmail: sessionLink.cohostEmail,
        revokedAt: sessionLink.revokedAt,
      });
    }
  }
  
  await room.save();
}
```

---

## 5. Security Considerations & Recommendations

### 5.1 Token Security

| Aspect | Implementation |
|--------|-----------------|
| **Token Format** | HMAC-SHA256 signed JWT with payload in base64url |
| **Token Rotation** |immutable per session; new token per login (don't enable browser persistence) |
| **Token Storage** | Browser SessionStorage (auto-clear on tab close), NOT LocalStorage |
| **Token Transmission** | HTTPS only; Authorization: Bearer header |
| **Token Liveness** | Server validates sessionId + sessionLinkId + isActive flag on every request |
| **Plaintext Security** | Never store raw tokens; store SHA256 hash + verify against hash on use |

### 5.2 Collision & Uniqueness Prevention

```typescript
// Ensure session link IDs are cryptographically unique
function generateSessionLinkId(): string {
  // UUID v4: 2^122 combinations, collision probability ~1 in 5.3 trillion
  const id = uuidv4();
  
  // Additional check: ensure no duplicate in DB before saving
  // (race condition prevention)
  const existing = await SessionLink.findOne({ sessionLinkId: id });
  if (existing) {
    return generateSessionLinkId(); // Retry (extremely rare)
  }
  return id;
}

// Token mutation detection
function verifyTokenHasNotBeenTamperedWith(token: string): boolean {
  const [payload, signature] = token.split('.');
  const computedSignature = crypto
    .createHmac('sha256', process.env.COHOST_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  
  return signature === computedSignature; // Constant-time comparison
  // Use: crypto.timingSafeEqual(signature, computedSignature);
}
```

### 5.3 Rate Limiting

```typescript
// Limit link generation per teacher per hour
const createLinkRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 links per hour
  keyGenerator: (req) => req.user.firebaseUID,
  message: 'Too many cohost links generated',
});

// Limit login attempts per link
async function checkLoginAttempts(sessionLink: ISessionLink) {
  if (sessionLink.loginAttempts > 10) {
    throw new Error('Too many login attempts. Link temporarily disabled.');
  }
  
  // Exponential backoff for repeated failures
  if (sessionLink.loginAttempts > 3) {
    const minutesSinceCreation = (Date.now() - sessionLink.issuedAt.getTime()) / 60000;
    const backoffMinutes = Math.pow(2, sessionLink.loginAttempts - 3);
    if (minutesSinceCreation < backoffMinutes) {
      throw new Error(`Too many attempts. Try again in ${backoffMinutes} minutes.`);
    }
  }
}

// Limit simultaneous cohost sessions per room
if (currentSession.temporaryCoHosts.filter(c => c.isActive).length >= room.maxCohosts) {
  throw new Error('Maximum cohosts for this session reached');
}
```

### 5.4 CSRF & Authentication Bypass Prevention

```typescript
// 1. Email verification (owner of email must click link)
// Link is sharable, but email must match to authenticate

// 2. Session binding: Cohost email must exactly match session link email
// Prevents: "Teacher generates link for attacker@evil.com, attacker uses with legitimate@example.com"

// 3. One-time-use-per-session (soft)
// Link can be reused for reconnects within same session (network drop recovery)
// But flag for abuse if reused after session changed

// 4. Device fingerprinting (optional, for anomaly detection)
sessionLink.ipAddressesUsed.push(getClientIP(request));
sessionLink.userAgents.push(request.headers['user-agent']);

// Warn if: Same link, new IP + new User-Agent
const isNewDevice = !sessionLink.ipAddressesUsed.includes(currentIP) &&
                     !sessionLink.userAgents.includes(currentUA);
if (isNewDevice && sessionLink.isRedeemed) {
  // Log suspicious activity, may require re-verification
  logSuspiciousActivity({
    sessionLinkId,
    event: 'NEW_DEVICE_DETECTED',
    previousDevices: sessionLink.userAgents.length,
  });
}
```

### 5.5 Data Privacy & Compliance

```typescript
// GDPR: Minimal data retention
class SessionLinkPurgePolicy {
  // Purge completed sessions after 30 days
  async purgeExpiredLinks() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await SessionLink.deleteMany({
      expiresAt: { $lt: thirtyDaysAgo },
      isActive: false,
    });
  }
  
  // Purge logs of failed login attempts after 7 days
  async purgeLoginLogs() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await SessionLink.updateMany(
      { issuedAt: { $lt: sevenDaysAgo } },
      { $set: { ipAddressesUsed: [], userAgents: [] } }
    );
  }
  
  // PII: Remove email from deleted records
  async sanitizeDeletedLinks() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await SessionLink.deleteMany({
      expiresAt: { $lt: thirtyDaysAgo },
    }); // Completely purge, not soft-delete
  }
}
```

### 5.6 XSS & Session Hijacking Prevention

```typescript
// Frontend storage & usage
function storeSessionToken(token: string) {
  // Use SessionStorage (auto-clears on tab close)
  sessionStorage.setItem('cohost_session_token', token);
  
  // Set HttpOnly + Secure if using cookie (better: use header)
  // Don't use localStorage for session tokens
}

function getSessionToken(): string {
  return sessionStorage.getItem('cohost_session_token');
}

// API request headers
async function makeCohostAPIRequest(endpoint: string) {
  const token = getSessionToken();
  return fetch(endpoint, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // Note: Don't set credentials: 'include' for temp cohosts
  });
}

// Prevent logout hijacking
function clearSessionToken() {
  sessionStorage.removeItem('cohost_session_token');
  // Also invalidate on backend if paranoid
}
```

---

## 6. Integration Points with Existing System

### 6.1 Room Controller Changes

```typescript
// In PollRoomController.ts, add methods:

@Post('/rooms/:roomCode/temporary-cohost-links')
@Authorized(['teacher'])
async generateTemporaryCohostLink(
  @Param('roomCode') roomCode: string,
  @Body() body: {
    cohostEmail: string;
    cohostName: string;
    permissions: string[];
  }
) {
  const link = await this.roomService.generateTemporaryCohostLink(
    roomCode,
    body.cohostEmail,
    body.cohostName,
    this.currentUser.firebaseUID,
    body.permissions
  );
  return { link: link.link, expiresAt: link.expiresAt };
}

@Get('/rooms/:roomCode/temporary-cohosts')
@Authorized(['teacher', 'cohost'])
async getTemporaryCohosts(
  @Param('roomCode') roomCode: string,
) {
  return await this.roomService.getTemporaryCohostsForSession(
    roomCode,
    this.requestContext.sessionId
  );
}

@Delete('/rooms/:roomCode/temporary-cohost-links/:sessionLinkId')
@Authorized(['teacher'])
async revokeCohostLink(
  @Param('roomCode') roomCode: string,
  @Param('sessionLinkId') sessionLinkId: string,
  @Body() body?: { reason?: string }
) {
  await this.roomService.revokeCohostLink(
    roomCode,
    sessionLinkId,
    this.currentUser.firebaseUID,
    body?.reason
  );
  return { success: true };
}
```

### 6.2 Auth Controller Changes

```typescript
// In AuthController.ts, add method:

@Post('/auth/login-cohost-session')
async authenticateCohostSessionLink(
  @Body() body: {
    token: string;
    roomCode: string;
    email: string;
  }
) {
  const result = await this.firebaseAuthService
    .validateAndAuthenticateTemporaryCohostLink(
      body.token,
      body.roomCode,
      body.email
    );
  
  return {
    sessionToken: result.sessionToken,
    user: {
      id: result.temporaryUserId,
      email: body.email,
      role: 'cohost',
      type: 'TEMPORARY_SESSION',
    },
    expiresAt: result.expiresAt,
  };
}

// Logout deletes session
@Post('/auth/logout-cohost-session')
@Authorized(['cohost'])
async logoutCohostSession() {
  const { sessionTokenId, sessionLinkId } = this.requestContext;
  
  // Remove from SessionToken
  await SessionToken.deleteOne({ sessionTokenId });
  
  // Mark as left
  const sessionLink = await SessionLink.findOne({ sessionLinkId });
  const room = await Room.findOne({ roomCode: sessionLink.roomCode });
  const session = room.sessions.find(s => s.sessionId === sessionLink.sessionId);
  
  if (session) {
    const cohost = session.temporaryCoHosts.find(c => c.sessionLinkId === sessionLinkId);
    if (cohost) {
      cohost.isActive = false;
      cohost.leftAt = new Date();
      await room.save();
    }
  }
  
  return { success: true };
}
```

### 6.3 Permission Checks in Existing Endpoints

Update all endpoints that check `isUserTeacherOrCohost()`:

```typescript
// In RoomService.ts, update:
async isUserTeacherOrCohost(roomCode: string, userId: string): Promise<boolean> {
  const room = await Room.findOne({ roomCode });
  
  // Check permanent cohost (Firebase user)
  if (room.coHosts?.some(c => c.userId === userId && c.isActive)) {
    return true;
  }
  
  // Check temporary cohost (session-based)
  const currentSession = room.sessions.find(s => !s.endedAt);
  if (currentSession?.temporaryCoHosts.some(
    c => c.sessionLinkId === userId && c.isActive // userId is synthetic
  )) {
    return true;
  }
  
  // Check teacher
  return room.teacherId === userId;
}

// In every cohost-permission-required endpoint:
@Post('/rooms/:roomCode/polls/:pollId/answer')
async submitPollAnswer(
  @Param('roomCode') roomCode: string,
) {
  // Check: only teacher or cohost can submit on behalf of students
  const isAuthorized = await this.isUserTeacherOrCohost(roomCode, this.currentUser.uid);
  if (!isAuthorized) {
    throw new ForbiddenException('Only teachers and cohosts can submit answers');
  }
  // ... continue
}
```

### 6.4 Socket.IO Integration

```typescript
// In PollSocket.ts, add handlers:

socket.on('temporary-cohost-joined', (data) => {
  // Broadcast to all connected users in room
  const room = roomManager.getRoom(data.roomCode);
  room.broadcast('cohost-joined', {
    cohostName: data.cohostName,
    cohostEmail: data.cohostEmail,
    sessionType: 'TEMPORARY',
    joinedAt: new Date(),
  });
});

socket.on('temporary-cohost-left', (data) => {
  const room = roomManager.getRoom(data.roomCode);
  room.broadcast('cohost-left', {
    cohostEmail: data.cohostEmail,
    leftAt: new Date(),
    reason: data.reason, // 'USER_ACTION', 'LINK_EXPIRED', 'SESSION_ENDED'
  });
});

// On room-ended: disconnect all temporary cohosts
socket.on('room-ended', () => {
  // Find all connected sockets with sessionId in context
  const socketsToDisconnect = roomConnections.filter(
    s => s.authContext.type === 'TEMPORARY_SESSION'
  );
  
  socketsToDisconnect.forEach(s => {
    s.emit('session-link-expired', {
      reason: 'ROOM_ENDED',
      message: 'The room has ended. Your session access is no longer valid.',
    });
    s.disconnect();
  });
});
```

### 6.5 Frontend Integration (React/TypeScript)

```typescript
// New pages/components needed:

// pages/temporary-cohost-login.tsx
// Form: Email input + Token from URL param
// On submit: POST /auth/login-cohost-session
// On success: Store token in sessionStorage, redirect to room

// components/cohost-session-expiry-modal.tsx
// Shows countdown to expiration
// Warns before auto-disconnect

// hooks/useTemporaryCohostSession.ts
// Manages session token lifecycle
// Handles expiration, re-auth, cleanup

// components/room-sidebar.tsx (existing)
// Add: Display "Temporary Cohosts" section differently
// Show expiry timer for each temporary cohost
// Allow teacher to revoke individual links
```

---

## 7. Edge Cases & Handling

| Edge Case | Behavior |
|-----------|----------|
| **Cohost mid-action when link expires** | WebSocket disconnect → Frontend shows "Your session has expired" → Force redirect to auth page |
| **Multiple cohosts from same email** | Allowed; each gets unique sessionLinkId; treated as separate sessions |
| **Cohost tab closed & reopened (same browser)** | SessionStorage cleared; must re-authenticate with link (acceptable UX) |
| **Link shared publicly** | Email validation required to authenticate; reduces but doesn't eliminate risk (recommend: single-use links for untrusted scenarios) |
| **Room ended while cohost is active** | Link immediately deactivated; Socket disconnect broadcast; cohost auto-logged out |
| **Network dropout mid-session** | Cohost reconnects within 10 sec → same sessionId valid; after 10 sec → must re-auth with token |
| **Teacher revokes link** | Immediate Socket disconnect; similar to expiration |
| **Scheduled session end time vs actual end** | Use actual end (when teacher clicks 'End') not predicted; override predicted expiry |
| **Database failure during link validation** | 503 Service Unavailable; client retries; after 5 min on same link, block as security measure |
| **Token in logs/error messages** | Hash or truncate tokens in logs (first 8 chars: `abc12345...`) |

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Link generation produces unique, validable tokens
- Token signature verification rejects tampered tokens
- Permission parsing from link data
- Email case-insensitive matching
- Expiration time calculations

### 8.2 Integration Tests
- End-to-end: Generate → Authenticate → Use permissions → Expire
- Room session lifecycle with temporary cohosts
- Cohost link revocation mid-session
- Multiple temporary cohosts in same session
- Permanent + temporary cohosts coexist
- Socket.IO disconnect on expiration

### 8.3 Security Tests
- Token reuse prevention
- HMAC signature validation
- Email mismatch rejection
- Expired link rejection
- Rate limiting (10 attempts)
- SQL injection in email field
- XSS in cohostName field

---

## 9. Deployment Checklist

- [ ] Environment variables set: `COHOST_SESSION_SECRET`, `JWT_SECRET`
- [ ] MongoDB indices created: `SessionLink.sessionId`, `SessionToken.expiresAt` (TTL)
- [ ] Cron jobs scheduled: Expiration, purging
- [ ] Rate limiters configured
- [ ] Frontend: SessionStorage (not localStorage) for tokens
- [ ] HTTPS enforced (tokens in headers)
- [ ] Logging sanitized (no full tokens)
- [ ] Rollback plan if critical bugs found
- [ ] Monitoring: Failed auth attempts, expired tokens, revocations
- [ ] Documentation for teachers on generating/managing links

---

## Summary Table

| Component | Responsibility |
|-----------|-----------------|
| **SessionLink** (MongoDB) | Persistent record of cohost link, permissions, usage |
| **SessionToken** (Redis/TTL) | Fast lookup of active session tokens |
| **RoomSession** (in Room) | Session instance with temp and perm cohosts |
| **generateTemporaryCohostLink()** | Endpoint for teacher link creation |
| **validateAndAuthenticateTemporaryCohostLink()** | Endpoint for cohost login |
| **Session lifecycle jobs** | Expiration, cleanup, purging |
| **Middleware updates** | Support temp + Firebase auth in parallel |
| **Socket.IO handlers** | Broadcast joins/leaves/expirations |

This design maintains backward compatibility with permanent cohost accounts while adding temporary session-specific access.

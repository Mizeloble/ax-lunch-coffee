import { customAlphabet, nanoid } from 'nanoid';

// 6-char uppercase room ID (no 0/O/1/I to avoid scan ambiguity)
const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomIdGen = customAlphabet(roomAlphabet, 6);

export const newRoomId = () => roomIdGen();
export const newPlayerToken = () => nanoid(16);
export const newHostToken = () => nanoid(24);

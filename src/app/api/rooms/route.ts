import { NextResponse } from 'next/server';
import { createRoom } from '../../../server/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const { roomId, hostToken } = createRoom();
  return NextResponse.json({ roomId, hostToken });
}

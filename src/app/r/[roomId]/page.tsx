import RoomClient from './RoomClient';

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ join?: string; fresh?: string }>;
}) {
  const { roomId } = await params;
  const sp = await searchParams;
  return (
    <RoomClient
      roomId={roomId.toUpperCase()}
      forceJoin={sp.join === '1'}
      fresh={sp.fresh === '1'}
    />
  );
}

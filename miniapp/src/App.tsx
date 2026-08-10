import RoomClient from '@/app/r/[roomId]/RoomClient';
import { useNavStore } from './router';
import { Home } from './Home';

export function App() {
  const path = useNavStore((s) => s.path);
  const [pathname, query = ''] = path.split('?');
  const room = pathname.match(/^\/r\/([^/]+)$/);

  if (room) {
    const params = new URLSearchParams(query);
    return (
      <RoomClient
        roomId={room[1]}
        forceJoin={params.get('join') === '1'}
        fresh={params.get('fresh') === '1'}
      />
    );
  }
  return <Home />;
}

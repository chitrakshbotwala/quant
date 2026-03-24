export default function UserManagement({ users, onBan }: { users: any[]; onBan: (id: string) => void }) {
  return (
    <div className="panel p-4 overflow-x-auto">
      <h3 className="font-semibold mb-3">User Management</h3>
      <table className="w-full text-sm">
        <thead className="text-zinc-400">
          <tr>
            <th className="text-left">Email</th>
            <th className="text-left">Name</th>
            <th className="text-left">Team</th>
            <th className="text-left">Active</th>
            <th className="text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-border">
              <td>{u.email}</td>
              <td>{u.name || '-'}</td>
              <td>{u.teamId || '-'}</td>
              <td>{u.isActive ? 'Yes' : 'No'}</td>
              <td><button onClick={() => onBan(u.id)} className="text-red">Ban</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

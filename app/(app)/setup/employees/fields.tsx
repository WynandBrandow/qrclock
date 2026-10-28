export function RoleField({ value = "employee" }: { value?: string }) {
  return (
    <div>
      <label className="label" htmlFor="role">Role</label>
      <select id="role" name="role" className="input" defaultValue={value}>
        <option value="employee">Employee: clocks in and out, sees own hours</option>
        <option value="manager">Manager: also reviews, corrects and approves hours</option>
        <option value="admin">Administrator: also sets up employees, kiosks and settings</option>
      </select>
    </div>
  );
}

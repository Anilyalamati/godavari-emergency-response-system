import { useEffect, useState, type FormEvent } from 'react';
import type { ConfigurationItem, StaffMember, StaffRole, TeamSummary } from '@godavari/shared';
import { useStaffAuth, StaffApiRequestError } from '../auth/AuthContext.js';

const roles: StaffRole[] = ['OPERATOR', 'RESPONDER', 'ADMIN'];
const roleLabel: Record<StaffRole, string> = {
  OPERATOR: 'Operator',
  RESPONDER: 'Responder',
  ADMIN: 'Administrator',
};

function requestMessage(error: unknown): string {
  return error instanceof StaffApiRequestError
    ? error.message
    : 'The administrator request could not be completed.';
}

function sameIds(left: string[], right: string[]): boolean {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

interface StaffEditorProps {
  member: StaffMember;
  teams: TeamSummary[];
  isSelf: boolean;
  onRefresh(): Promise<void>;
}

function StaffEditor({ member, teams, isSelf, onRefresh }: StaffEditorProps) {
  const { apiRequest } = useStaffAuth();
  const [role, setRole] = useState(member.role);
  const [isActive, setIsActive] = useState(member.isActive);
  const [canAccessReporterContacts, setCanAccessReporterContacts] = useState(
    member.canAccessReporterContacts,
  );
  const [teamIds, setTeamIds] = useState(member.teamIds);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setRole(member.role);
    setIsActive(member.isActive);
    setCanAccessReporterContacts(member.canAccessReporterContacts);
    setTeamIds(member.teamIds);
  }, [member]);

  async function saveProfile() {
    const changes: Record<string, string | boolean> = {};
    if (role !== member.role) changes.role = role;
    if (isActive !== member.isActive) changes.isActive = isActive;
    if (canAccessReporterContacts !== member.canAccessReporterContacts) {
      changes.canAccessReporterContacts = canAccessReporterContacts;
    }
    if (Object.keys(changes).length === 0) {
      setFeedback('No profile changes to save.');
      setProblem(null);
      return;
    }

    setBusy(true);
    setFeedback(null);
    setProblem(null);
    try {
      await apiRequest(`/admin/staff/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      });
      await onRefresh();
      setFeedback('Staff profile updated.');
    } catch (error) {
      setProblem(requestMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveTeams() {
    if (sameIds(teamIds, member.teamIds)) {
      setFeedback('No team membership changes to save.');
      setProblem(null);
      return;
    }

    setBusy(true);
    setFeedback(null);
    setProblem(null);
    try {
      await apiRequest(`/admin/staff/${member.id}/teams`, {
        method: 'PUT',
        body: JSON.stringify({ teamIds }),
      });
      await onRefresh();
      setFeedback('Team memberships updated.');
    } catch (error) {
      setProblem(requestMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function toggleTeam(teamId: string) {
    setTeamIds((current) =>
      current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId],
    );
  }

  return (
    <article className="staff-member-card">
      <div className="staff-member-heading">
        <div>
          <h3>{member.displayName}</h3>
          <p>
            {roleLabel[member.role]} · {member.isActive ? 'Active' : 'Inactive'}
          </p>
        </div>
        {isSelf && <span className="placeholder-badge">Your account</span>}
      </div>

      <div className="staff-member-fields">
        <label>
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.currentTarget.value as StaffRole)}
            disabled={isSelf || busy}
          >
            {roles.map((option) => (
              <option value={option} key={option}>
                {roleLabel[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.currentTarget.checked)}
            disabled={isSelf || busy}
          />
          Active staff access
        </label>
        <label className="inline-check permission-check">
          <input
            type="checkbox"
            checked={canAccessReporterContacts}
            onChange={(event) => setCanAccessReporterContacts(event.currentTarget.checked)}
            disabled={isSelf || busy}
          />
          Explicit operational permission to read reporter contacts
        </label>
      </div>

      <button
        className="button button-secondary admin-small-button"
        type="button"
        onClick={() => void saveProfile()}
        disabled={isSelf || busy}
      >
        Save staff access
      </button>

      <fieldset className="team-membership-fieldset" disabled={isSelf || busy}>
        <legend>Team membership</legend>
        {teams.length === 0 ? (
          <p className="form-footnote">No teams are available.</p>
        ) : (
          <div className="team-check-list">
            {teams.map((team) => (
              <label className="inline-check" key={team.id}>
                <input
                  type="checkbox"
                  checked={teamIds.includes(team.id)}
                  onChange={() => toggleTeam(team.id)}
                />
                {team.name}
                {team.isDemo ? ' · fictional demo' : ''}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <button
        className="button button-secondary admin-small-button"
        type="button"
        onClick={() => void saveTeams()}
        disabled={isSelf || busy}
      >
        Save team membership
      </button>

      {isSelf && (
        <p className="form-footnote">
          You cannot change your own role or team membership. Ask another authorized administrator.
        </p>
      )}
      {feedback && (
        <p className="form-success" role="status">
          {feedback}
        </p>
      )}
      {problem && (
        <p className="form-alert" role="alert">
          {problem}
        </p>
      )}
    </article>
  );
}

interface InvitationFormProps {
  teams: TeamSummary[];
  onInvited(): Promise<void>;
}

function InvitationForm({ teams, onInvited }: InvitationFormProps) {
  const { apiRequest } = useStaffAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<StaffRole>('RESPONDER');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function toggleTeam(teamId: string) {
    setTeamIds((current) =>
      current.includes(teamId) ? current.filter((id) => id !== teamId) : [...current, teamId],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setFeedback(null);
    try {
      await apiRequest('/admin/staff/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          displayName: displayName.trim(),
          role,
          teamIds,
          canAccessReporterContacts: permission,
        }),
      });
      setEmail('');
      setDisplayName('');
      setRole('RESPONDER');
      setTeamIds([]);
      setPermission(false);
      setFeedback(
        'Invitation sent. The recipient must use the approved one-time link to set a password.',
      );
      await onInvited();
    } catch (error) {
      setProblem(requestMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <h3>Invite staff</h3>
      <label htmlFor="invite-name">Staff display name</label>
      <input
        id="invite-name"
        name="displayName"
        autoComplete="name"
        maxLength={120}
        required
        value={displayName}
        onChange={(event) => setDisplayName(event.currentTarget.value)}
        disabled={busy}
      />
      <label htmlFor="invite-email">Work email</label>
      <input
        id="invite-email"
        name="email"
        type="email"
        autoComplete="email"
        maxLength={254}
        required
        value={email}
        onChange={(event) => setEmail(event.currentTarget.value)}
        disabled={busy}
      />
      <label htmlFor="invite-role">Assigned role</label>
      <select
        id="invite-role"
        value={role}
        onChange={(event) => setRole(event.currentTarget.value as StaffRole)}
        disabled={busy}
      >
        {roles.map((option) => (
          <option value={option} key={option}>
            {roleLabel[option]}
          </option>
        ))}
      </select>
      <fieldset className="team-membership-fieldset" disabled={busy}>
        <legend>Initial team membership</legend>
        <div className="team-check-list">
          {teams.map((team) => (
            <label className="inline-check" key={team.id}>
              <input
                type="checkbox"
                checked={teamIds.includes(team.id)}
                onChange={() => toggleTeam(team.id)}
              />
              {team.name}
              {team.isDemo ? ' · fictional demo' : ''}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="inline-check permission-check">
        <input
          type="checkbox"
          checked={permission}
          onChange={(event) => setPermission(event.currentTarget.checked)}
          disabled={busy}
        />
        Grant explicit operational permission to access reporter contacts
      </label>
      <button className="button button-primary admin-submit" type="submit" disabled={busy}>
        {busy ? 'Sending invitation…' : 'Send staff invitation'}
      </button>
      {feedback && (
        <p className="form-success" role="status">
          {feedback}
        </p>
      )}
      {problem && (
        <p className="form-alert" role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}

interface ConfigurationFormProps {
  items: ConfigurationItem[];
  onSaved(): Promise<void>;
}

function ConfigurationForm({ items, onSaved }: ConfigurationFormProps) {
  const { apiRequest } = useStaffAuth();
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('{\n  "prototype": true\n}');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    setProblem(null);
    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      setProblem('Enter valid JSON before saving.');
      setBusy(false);
      return;
    }
    if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
      setProblem('The configuration value must be a JSON object.');
      setBusy(false);
      return;
    }

    try {
      await apiRequest(`/admin/configuration/${encodeURIComponent(key.trim())}`, {
        method: 'PUT',
        body: JSON.stringify({ value: parsedValue, description: description.trim() }),
      });
      setFeedback('Non-secret configuration saved.');
      await onSaved();
    } catch (error) {
      setProblem(requestMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-configuration-grid">
      <form className="admin-form" onSubmit={submit}>
        <h3>Add or update a setting</h3>
        <label htmlFor="configuration-key">Configuration key</label>
        <input
          id="configuration-key"
          value={key}
          onChange={(event) => setKey(event.currentTarget.value)}
          pattern="[a-z0-9][a-z0-9._-]{0,99}"
          maxLength={100}
          required
          disabled={busy}
        />
        <label htmlFor="configuration-description">Description</label>
        <input
          id="configuration-description"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          maxLength={500}
          required
          disabled={busy}
        />
        <label htmlFor="configuration-value">JSON object value</label>
        <textarea
          id="configuration-value"
          rows={6}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          required
          disabled={busy}
        />
        <p className="form-footnote">
          Never store access keys, tokens, passwords, or reporter contact details in configuration.
        </p>
        <button className="button button-primary admin-submit" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save configuration'}
        </button>
        {feedback && (
          <p className="form-success" role="status">
            {feedback}
          </p>
        )}
        {problem && (
          <p className="form-alert" role="alert">
            {problem}
          </p>
        )}
      </form>
      <div className="configuration-list" aria-label="Current configuration">
        <h3>Current non-secret settings</h3>
        {items.length === 0 ? (
          <p className="workspace-empty">No settings are stored.</p>
        ) : (
          items.map((item) => (
            <article className="configuration-item" key={item.key}>
              <h4>{item.key}</h4>
              <p>{item.description}</p>
              <pre>{JSON.stringify(item.value, null, 2)}</pre>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

export function AdminPage() {
  const { apiRequest, profile } = useStaffAuth();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [configuration, setConfiguration] = useState<ConfigurationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  async function refreshStaff() {
    const records = await apiRequest<StaffMember[]>('/admin/staff');
    setMembers(records);
  }

  async function refreshConfiguration() {
    const settings = await apiRequest<ConfigurationItem[]>('/admin/configuration');
    setConfiguration(settings);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setProblem(null);
    void Promise.all([
      apiRequest<StaffMember[]>('/admin/staff'),
      apiRequest<TeamSummary[]>('/admin/teams'),
      apiRequest<ConfigurationItem[]>('/admin/configuration'),
    ])
      .then(([staffRecords, teamRecords, settings]) => {
        if (!active) return;
        setMembers(staffRecords);
        setTeams(teamRecords);
        setConfiguration(settings);
      })
      .catch((error: unknown) => {
        if (active) setProblem(requestMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiRequest]);

  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <h1 id="admin-title">Administration</h1>

      {loading ? (
        <p className="workspace-empty" role="status">
          Loading…
        </p>
      ) : problem ? (
        <p className="form-alert" role="alert">
          {problem}
        </p>
      ) : (
        <>
          <section className="admin-section" aria-labelledby="staff-heading">
            <div className="section-heading">
              <h2 id="staff-heading">Staff access</h2>
            </div>
            <div className="admin-staff-grid">
              <InvitationForm teams={teams} onInvited={refreshStaff} />
              <div className="staff-member-list" aria-label="Provisioned staff accounts">
                {members.map((member) => (
                  <StaffEditor
                    key={member.id}
                    member={member}
                    teams={teams}
                    isSelf={member.id === profile?.id}
                    onRefresh={refreshStaff}
                  />
                ))}
              </div>
            </div>
          </section>
          <section className="admin-section" aria-labelledby="configuration-heading">
            <div className="section-heading">
              <h2 id="configuration-heading">Configuration</h2>
            </div>
            <ConfigurationForm items={configuration} onSaved={refreshConfiguration} />
          </section>
        </>
      )}
    </section>
  );
}

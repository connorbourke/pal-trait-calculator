import { useState } from "react";
import { palIconUrl } from "../lib/icons";
import {
  normalizePassive,
  passiveRankClass,
  specimenElements,
  specimenLabel,
  specimenStars,
  specimenTitle,
  type SpecimenV1,
} from "../lib/specimens";
import type { Pal } from "../lib/types";

export function SpecimenStrip({
  specimens,
  resolvePal,
}: {
  specimens: SpecimenV1[];
  resolvePal?: (species: string) => Pal | null;
}) {
  if (specimens.length === 0) return null;

  return (
    <section className="specimen-strip" aria-label="Injected pal specimens">
      <h3 className="specimen-strip-title">Injected pals</h3>
      <p className="quiet specimen-strip-note">
        Instance cards from a linked save — species + level identify most pals.
        Breeding math still uses species only (IVs/passives display-only).
      </p>
      <ul className="specimen-grid">
        {specimens.map((s, i) => (
          <li key={s.id ?? `${s.species}-${s.level ?? "x"}-${i}`}>
            <SpecimenCard
              specimen={s}
              pal={resolvePal?.(s.species) ?? null}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SpecimenCard({
  specimen,
  pal,
}: {
  specimen: SpecimenV1;
  pal?: Pal | null;
}) {
  const title = specimenTitle(specimen);
  const stars = specimenStars(specimen);
  const elements = specimenElements(specimen);
  const passives = (specimen.passives ?? []).map(normalizePassive);
  const iconSrc =
    specimen.portraitUrl?.trim() ||
    (pal ? palIconUrl(pal) : null) ||
    (specimen.species
      ? palIconUrl({ name: specimen.species })
      : null);

  return (
    <article className="pal-instance-card">
      <header className="pal-instance-head">
        <SpecimenPortrait src={iconSrc} alt={title} />
        <div className="pal-instance-titles">
          <h4 className="pal-instance-name">{title}</h4>
          {specimen.internalName ? (
            <p className="pal-instance-internal">{specimen.internalName}</p>
          ) : specimen.nickname &&
            specimen.nickname.trim() !== specimen.species.trim() ? (
            <p className="pal-instance-internal">{specimen.species}</p>
          ) : null}
        </div>
      </header>

      <div className="pal-instance-badges">
        {specimen.level != null ? (
          <span className="pal-badge pal-badge-level">LV {specimen.level}</span>
        ) : null}
        {specimen.gender && specimen.gender !== "unknown" ? (
          <span
            className={`pal-badge pal-badge-gender gender-${specimen.gender}`}
            title={specimen.gender}
            aria-label={specimen.gender}
          >
            {specimen.gender === "male" ? "♂" : "♀"}
          </span>
        ) : null}
        {stars != null ? (
          <span className="pal-badge pal-badge-stars" aria-label={`${stars} stars`}>
            {"★".repeat(stars)}
            <span className="pal-stars-empty">{"★".repeat(Math.max(0, 4 - stars))}</span>
          </span>
        ) : null}
        {specimen.alpha ? (
          <span className="pal-badge pal-badge-alpha">ALPHA</span>
        ) : null}
        {elements.map((el) => (
          <span key={el} className="pal-badge pal-badge-element">
            <span className={`pal-element-dot element-${slug(el)}`} aria-hidden />
            {el}
          </span>
        ))}
        {specimen.role ? (
          <span className="pal-badge pal-badge-role">
            {formatSpecimenRole(specimen.role)}
          </span>
        ) : null}
      </div>

      {passives.length > 0 ? (
        <section className="pal-instance-section">
          <h5>Passives</h5>
          <ul className="passive-nameplates">
            {passives.map((p) => (
              <li
                key={p.name}
                className={`passive-nameplate ${passiveRankClass(p.rank)}`}
                title={p.description}
              >
                {p.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasIvs(specimen) ? (
        <section className="pal-instance-section">
          <h5>IVs</h5>
          <div className="pal-iv-grid">
            <IvBox label="HP" value={specimen.ivs?.hp} />
            <IvBox label="ATK" value={specimen.ivs?.attack} />
            <IvBox label="DEF" value={specimen.ivs?.defense} />
          </div>
        </section>
      ) : null}

      {hasStats(specimen) ? (
        <section className="pal-instance-section">
          <h5>Stats</h5>
          <div className="pal-stat-grid">
            <StatBox label="Health" value={specimen.stats?.hp} />
            <StatBox label="Attack" value={specimen.stats?.attack} />
            <StatBox label="Defense" value={specimen.stats?.defense} />
            <StatBox label="Work Speed" value={specimen.stats?.workSpeed} />
          </div>
        </section>
      ) : null}

      {specimen.owner || specimen.where || specimen.guild ? (
        <dl className="pal-instance-ownership">
          {specimen.owner ? (
            <>
              <dt>Owner</dt>
              <dd>{specimen.owner}</dd>
            </>
          ) : null}
          {specimen.where ? (
            <>
              <dt>Where</dt>
              <dd>{specimen.where}</dd>
            </>
          ) : null}
          {specimen.guild ? (
            <>
              <dt>Guild</dt>
              <dd>{specimen.guild}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </article>
  );
}

export function SpecimenInlineNotes({
  specimens,
  speciesName,
}: {
  specimens: SpecimenV1[];
  speciesName: string;
}) {
  const matches = specimens.filter(
    (s) => s.species.trim().toLowerCase() === speciesName.trim().toLowerCase(),
  );
  if (matches.length === 0) return null;
  return (
    <div className="specimen-inline">
      {matches.map((s, i) => (
        <span
          key={s.id ?? `${speciesName}-${s.level ?? i}`}
          className="specimen-chip"
          title={specimenLabel(s)}
        >
          {specimenTitle(s)}
          {s.level != null ? ` · Lv ${s.level}` : null}
          {s.owner ? ` · ${s.owner}` : null}
        </span>
      ))}
    </div>
  );
}

function SpecimenPortrait({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="pal-instance-art fallback" aria-hidden>
        {alt.slice(0, 2)}
      </div>
    );
  }
  return (
    <div className="pal-instance-art">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function IvBox({ label, value }: { label: string; value?: number }) {
  if (value == null) return null;
  return (
    <div className="pal-iv-box">
      <span className="pal-iv-label">{label}</span>
      <span className="pal-iv-value">{value}</span>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value?: number }) {
  if (value == null) return null;
  return (
    <div className="pal-stat-box">
      <span className="pal-stat-label">{label}</span>
      <span className="pal-stat-value">{value.toLocaleString()}</span>
    </div>
  );
}

function hasIvs(s: SpecimenV1): boolean {
  return (
    s.ivs?.hp != null || s.ivs?.attack != null || s.ivs?.defense != null
  );
}

function hasStats(s: SpecimenV1): boolean {
  return (
    s.stats?.hp != null ||
    s.stats?.attack != null ||
    s.stats?.defense != null ||
    s.stats?.workSpeed != null
  );
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const ROLE_LABELS: Record<string, string> = {
  traita: "Trait A",
  traitb: "Trait B",
  start: "Start",
  target: "Target",
  waypoint: "Waypoint",
  partner: "Partner",
  owned: "Owned",
};

function formatSpecimenRole(role: string): string {
  const key = role.trim().toLowerCase();
  if (ROLE_LABELS[key]) return ROLE_LABELS[key];
  // camelCase / PascalCase → spaced words
  const spaced = role
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

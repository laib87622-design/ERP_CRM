export default function PageHeader({ eyebrow, title, action, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-gold">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-serif text-3xl text-brand-navy">{title}</h2>
        {children}
      </div>

      {action && <div>{action}</div>}
    </div>
  );
}

"use client";

export const MAIL_DOMAIN = "inout-media.es";

export function EmailInput({
  value,
  onChange,
  placeholder = "nombre",
  required = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-stretch border border-line focus-within:border-paper">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.split("@")[0].toLowerCase().replace(/\s/g, ""))}
        placeholder={placeholder}
        required={required}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-paper placeholder:text-muted/60 focus:outline-none"
      />
      <span className="flex items-center px-3 text-sm text-muted border-l border-line select-none">
        @{MAIL_DOMAIN}
      </span>
    </div>
  );
}

export function fullEmail(local: string) {
  return `${local}@${MAIL_DOMAIN}`;
}

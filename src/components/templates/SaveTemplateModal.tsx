"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Sheet";

export interface SaveTemplateModalProps {
  open: boolean;
  defaultName?: string;
  onSave: (name: string, folder: string | null) => Promise<void> | void;
  onClose: () => void;
}

/** "Save workout as template": a name and an optional folder. */
export function SaveTemplateModal({ open, defaultName = "", onSave, onClose }: SaveTemplateModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Save as template">
      {open ? <SaveTemplateForm defaultName={defaultName} onSave={onSave} onClose={onClose} /> : null}
    </Modal>
  );
}

function SaveTemplateForm({ defaultName, onSave, onClose }: Required<Pick<SaveTemplateModalProps, "defaultName" | "onSave" | "onClose">>) {
  const [name, setName] = useState(defaultName);
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name the template.");
    setBusy(true);
    try {
      await onSave(name.trim(), folder.trim() || null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="wk-form" onSubmit={submit} noValidate>
      <Field label="Template name" value={name} onChange={(e) => setName(e.target.value)} error={error} required />
      <Field label="Folder (optional)" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Push / Pull / Legs" />
      <div className="wk-form__actions">
        <Button type="submit" loading={busy}>
          Save template
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

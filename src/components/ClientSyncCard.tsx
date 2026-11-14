import { Plus, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ClientSyncCardProps {
  syncing: boolean;
  importing: boolean;
  importId: string;
  onImportIdChange: (value: string) => void;
  onAddClient: () => void;
  onSyncAll: () => void;
  onImport: () => void;
}

/** Clients page: add a client, sync all clients from Sellsy, or import one by Sellsy ID. */
export function ClientSyncCard({
  syncing,
  importing,
  importId,
  onImportIdChange,
  onAddClient,
  onSyncAll,
  onImport,
}: ClientSyncCardProps) {
  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Synchro clients Sellsy</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Importer ou mettre à jour les fiches clients depuis Sellsy.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button size="sm" variant="outline" className="h-10 w-full gap-2 sm:h-9 sm:w-auto" onClick={onAddClient}>
            <Plus className="h-4 w-4" /> Nouveau client
          </Button>
          <Button
            size="sm"
            className="h-auto min-h-10 w-full gap-2 whitespace-normal bg-brand-orange text-brand-ink hover:bg-brand-orange opacity-95 sm:min-h-9 sm:w-auto"
            onClick={onSyncAll}
            disabled={syncing}
          >
            <RefreshCw className={cn("h-4 w-4 shrink-0", syncing && "animate-spin")} />
            {syncing ? "synchronisation…" : "Synchroniser les clients depuis Sellsy"}
          </Button>
        </div>
      </div>

      {/* Import single client by Sellsy ID */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Input
          placeholder="ID client Sellsy (ex. 46)"
          inputMode="numeric"
          value={importId}
          onChange={(e) => onImportIdChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onImport()}
          className="h-10 min-w-0 flex-1 basis-40 text-base sm:h-8 sm:text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-10 gap-1.5 shrink-0 sm:h-8"
          disabled={!importId.trim() || importing}
          onClick={onImport}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", importing && "animate-spin")} />
          {importing ? "Import…" : "Importer le client"}
        </Button>
      </div>
    </div>
  );
}

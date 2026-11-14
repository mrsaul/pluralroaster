import { useState, useMemo } from "react";
import { AlertCircle, ChevronRight, Search, Trash2, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppClient } from "./AdminClientDetail";

interface AdminClientsSectionProps {
  clients: AppClient[];
  loading: boolean;
  error: string | null;
  onSelectClient: (client: AppClient) => void;
  onDeleteClient?: (client: AppClient) => void;
}

function resolveField(client: AppClient, field: "company_name" | "contact_name" | "email" | "phone" | "delivery_address" | "pricing_tier") {
  if (client.client_data_mode === "custom") {
    const customKey = `custom_${field}` as keyof AppClient;
    const custom = client[customKey];
    if (custom) return String(custom);
  }
  return client[field] ?? "—";
}

export function AdminClientsSection({ clients, loading, error, onSelectClient, onDeleteClient }: AdminClientsSectionProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => {
      const name = resolveField(c, "company_name").toLowerCase();
      const contact = resolveField(c, "contact_name").toLowerCase();
      const email = resolveField(c, "email").toLowerCase();
      return name.includes(q) || contact.includes(q) || email.includes(q);
    });
  }, [clients, query]);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-muted-foreground">
            Clients ({query ? `${filtered.length} / ${clients.length}` : clients.length})
          </h2>
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un client…"
            className="h-10 sm:h-8 pl-8 pr-8 text-base sm:text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {error ? (
          <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Impossible de charger les clients</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Phones: one tappable card per client */}
        <ul aria-label="Clients" className="md:hidden divide-y divide-border">
          {loading ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Chargement des clients…</li>
          ) : filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              {query ? `Aucun client pour « ${query} »` : "Aucun client."}
            </li>
          ) : (
            filtered.map((client) => (
              <li key={client.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelectClient(client)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-muted/60"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium text-foreground break-words">{resolveField(client, "company_name")}</p>
                    <p className="text-xs text-muted-foreground truncate">{resolveField(client, "contact_name")}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <Badge
                        variant={client.onboarding_status === "completed" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {client.onboarding_status === "completed" ? "Actif" : "En attente"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{resolveField(client, "pricing_tier")}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
                {onDeleteClient && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Supprimer ${resolveField(client, "company_name")}`}
                    className="mr-2 h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteClient(client)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))
          )}
        </ul>

        {/* Wider screens: full table */}
        <div data-clients-table className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Entreprise</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Adresse de livraison</TableHead>
              <TableHead>Palier</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Source</TableHead>
              <TableHead className="text-right">Profil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  Chargement des clients…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  {query ? `Aucun client pour « ${query} »` : "Aucun client."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((client) => {
                const isCustom = client.client_data_mode === "custom";
                return (
                  <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectClient(client)}>
                    <TableCell>
                      <p className="font-medium text-foreground">{resolveField(client, "company_name")}</p>
                      {client.sellsy_client_id && (
                        <p className="text-xs text-muted-foreground font-mono">{client.sellsy_client_id}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p className="text-foreground">{resolveField(client, "contact_name")}</p>
                        <p className="text-xs text-muted-foreground">{resolveField(client, "email")}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {resolveField(client, "delivery_address")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {resolveField(client, "pricing_tier")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={client.onboarding_status === "completed" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {client.onboarding_status === "completed" ? "Actif" : "En attente"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {isCustom ? (
                        <Badge variant="outline" className="text-[10px] border-accent text-accent-foreground">Personnalisé</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sellsy</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onDeleteClient && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onDeleteClient(client); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="gap-2">
                          Ouvrir
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </section>
  );
}

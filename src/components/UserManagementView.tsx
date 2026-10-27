import { useState, useEffect, useCallback } from "react";
import {
  Users, UserPlus, RefreshCw, MoreHorizontal,
  Shield, Flame, Package, ShieldCheck, Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { validateKitchenAccess } from "@/components/kitchenAccessForm";

type AppRole = "admin" | "user" | "roaster" | "packaging";
type KitchenRole = "coffee_manager" | "stores_manager" | "kitchen_manager";

const KITCHEN_ROLE_LABELS: Record<KitchenRole, string> = {
  coffee_manager: "Responsable café",
  stores_manager: "Responsable des boutiques",
  kitchen_manager: "Responsable cuisine",
};

const KITCHEN_ERRORS: Record<string, string> = {
  coffee_manager_needs_cafe: "Choisissez un café pour un responsable café.",
  needs_some_access: "Choisissez un accès Café ou un accès Cuisine.",
  kitchen_not_for_role: "Les comptes torréfaction et conditionnement ne peuvent pas avoir d'accès Cuisine.",
};

interface Cafe {
  id: string;
  name: string;
  isActive: boolean;
}

interface ManagedUser {
  userId: string;
  email: string;
  fullName: string | null;
  role: AppRole | null;
  status: string;
  invitedAt: string | null;
  lastSignIn: string | null;
  kitchenRole: KitchenRole | null;
  cafeId: string | null;
  cafeName: string | null;
}

const ROLE_META: Record<AppRole, { label: string; icon: typeof Shield; color: string }> = {
  admin: { label: "Admin", icon: ShieldCheck, color: "bg-primary/10 text-primary border-primary/20" },
  user: { label: "Client", icon: Users, color: "bg-muted text-muted-foreground border-border" },
  roaster: { label: "Torréfaction", icon: Flame, color: "bg-warning/10 text-warning border-warning/20" },
  packaging: { label: "Conditionnement", icon: Package, color: "bg-info/10 text-info border-info/20" },
};

const STATUS_LABELS: Record<string, string> = {
  active: "actif",
  invited: "invité",
  disabled: "désactivé",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-success/10 text-success",
  invited: "bg-warning/10 text-warning",
  disabled: "bg-destructive/10 text-destructive",
};

export function UserManagementView() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole | "none">("roaster");
  const [inviting, setInviting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string; user: ManagedUser } | null>(null);
  const [roleChangeUser, setRoleChangeUser] = useState<ManagedUser | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("user");
  const [inviteKitchenRole, setInviteKitchenRole] = useState<KitchenRole | "none">("none");
  const [inviteCafeId, setInviteCafeId] = useState<string>("");
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [newCafeName, setNewCafeName] = useState("");
  const [editingCafe, setEditingCafe] = useState<{ id: string; name: string } | null>(null);
  const [kitchenEditUser, setKitchenEditUser] = useState<ManagedUser | null>(null);
  const [editKitchenRole, setEditKitchenRole] = useState<KitchenRole | "none">("none");
  const [editCafeId, setEditCafeId] = useState<string>("");
  const { toast } = useToast();

  const loadCafes = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "list-cafes" },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Impossible de charger les cafés");
      setCafes(data.cafes ?? []);
    } catch (err) {
      toast({ title: "Impossible de charger les cafés", description: String(err), variant: "destructive" });
    }
  }, [toast]);

  const saveCafe = async (cafe: { id?: string; name: string; isActive: boolean }) => {
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "upsert-cafe", ...cafe },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Échec de l'enregistrement");
      await loadCafes();
    } catch (err) {
      toast({ title: "Échec de la mise à jour du café", description: String(err), variant: "destructive" });
    }
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "list" },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Impossible de charger les utilisateurs");
      setUsers(data.users ?? []);
    } catch (err) {
      toast({ title: "Impossible de charger les utilisateurs", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadUsers(); void loadCafes(); }, [loadUsers, loadCafes]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    const check = validateKitchenAccess({
      coffeeRole: inviteRole,
      kitchenRole: inviteKitchenRole === "none" ? null : inviteKitchenRole,
      cafeId: inviteCafeId || null,
    });
    if (check.ok === false) {
      toast({ title: "Échec de l'invitation", description: KITCHEN_ERRORS[check.error], variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      const kitchen = inviteKitchenRole === "none"
        ? undefined
        : { role: inviteKitchenRole, ...(inviteKitchenRole === "coffee_manager" ? { cafeId: inviteCafeId } : {}) };
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "invite", email: inviteEmail.trim().toLowerCase(), role: inviteRole, kitchen },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Échec de l'invitation");
      const label = inviteRole === "none" ? "Accès Cuisine uniquement" : ROLE_META[inviteRole].label;
      toast({ title: "Invitation envoyée", description: `${inviteEmail} invité·e : ${label}` });
      setInviteEmail("");
      setInviteKitchenRole("none");
      setInviteCafeId("");
      setInviteOpen(false);
      await loadUsers();
    } catch (err) {
      toast({ title: "Échec de l'invitation", description: String(err), variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const handleAction = async (action: string, user: ManagedUser) => {
    try {
      if (action === "disable" || action === "enable" || action === "remove") {
        const { data, error } = await supabase.functions.invoke("invite-user", {
          body: { action, userId: user.userId },
        });
        if (error || !data?.success) throw new Error(data?.error || error?.message);
        toast({ title: action === "remove" ? "Utilisateur supprimé" : action === "disable" ? "Accès désactivé" : action === "enable" ? "Accès réactivé" : "Action effectuée" });
      } else if (action === "resend-invite") {
        const { data, error } = await supabase.functions.invoke("invite-user", {
          body: { action: "resend-invite", email: user.email },
        });
        if (error || !data?.success) throw new Error(data?.error || error?.message);
        toast({ title: "Invitation renvoyée", description: `E-mail envoyé à ${user.email}` });
      }
      await loadUsers();
    } catch (err) {
      toast({ title: "Échec de l'action", description: String(err), variant: "destructive" });
    }
    setConfirmAction(null);
  };

  const handleRoleChange = async () => {
    if (!roleChangeUser) return;
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "update-role", userId: roleChangeUser.userId, role: newRole },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message);
      toast({ title: "Rôle mis à jour", description: `${roleChangeUser.email} est maintenant ${ROLE_META[newRole].label}` });
      await loadUsers();
    } catch (err) {
      toast({ title: "Échec de la mise à jour du rôle", description: String(err), variant: "destructive" });
    }
    setRoleChangeUser(null);
  };

  const handleKitchenEdit = async () => {
    if (!kitchenEditUser) return;
    const check = validateKitchenAccess({
      coffeeRole: kitchenEditUser.role ?? "none",
      kitchenRole: editKitchenRole === "none" ? null : editKitchenRole,
      cafeId: editCafeId || null,
    });
    // A kitchen-only user must keep some Kitchen access (otherwise they would have no access at all);
    // to revoke everything, use « Supprimer l’utilisateur ».
    if (check.ok === false) {
      toast({ title: "Accès Cuisine non enregistré", description: KITCHEN_ERRORS[check.error], variant: "destructive" });
      return;
    }
    try {
      const kitchen = editKitchenRole === "none"
        ? null
        : { role: editKitchenRole, ...(editKitchenRole === "coffee_manager" ? { cafeId: editCafeId } : {}) };
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { action: "set-kitchen-access", userId: kitchenEditUser.userId, kitchen },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message);
      toast({ title: "Accès Cuisine mis à jour", description: kitchenEditUser.email });
      setKitchenEditUser(null);
      await loadUsers();
    } catch (err) {
      toast({ title: "Échec de la mise à jour de l'accès Cuisine", description: String(err), variant: "destructive" });
    }
  };

  const stats = {
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    invited: users.filter((u) => u.status === "invited").length,
  };

  return (
    <section className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Utilisateurs</p>
          <p className="text-2xl font-medium tabular-nums text-foreground">{stats.total}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Actifs</p>
          <p className="text-2xl font-medium tabular-nums text-success">{stats.active}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Invitations en attente</p>
          <p className="text-2xl font-medium tabular-nums text-warning">{stats.invited}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-2">Rôles</p>
          <div className="flex gap-1 flex-wrap mt-1">
            {(["admin", "roaster", "packaging"] as AppRole[]).map((r) => {
              const count = users.filter((u) => u.role === r).length;
              return count > 0 ? (
                <Badge key={r} variant="outline" className={cn("text-[10px]", ROLE_META[r].color)}>
                  {count} {ROLE_META[r].label}
                </Badge>
              ) : null;
            })}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h2 className="text-lg font-medium text-foreground">Équipe</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadUsers()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Actualiser
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setInviteOpen(true)}>
            <UserPlus className="w-4 h-4" /> Inviter
          </Button>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Utilisateur</TableHead>
                <TableHead>Rôle Café</TableHead>
                <TableHead>Cuisine</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Chargement des utilisateurs…</TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aucun utilisateur.</TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const roleMeta = user.role ? (ROLE_META[user.role] ?? ROLE_META.user) : null;
                  const RoleIcon = roleMeta?.icon;
                  return (
                    <TableRow key={user.userId} className={cn(user.status === "disabled" && "opacity-50")}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground text-sm">{user.fullName || user.email}</p>
                          {user.fullName && <p className="text-xs text-muted-foreground">{user.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {roleMeta && RoleIcon ? (
                          <Badge variant="outline" className={cn("gap-1", roleMeta.color)}>
                            <RoleIcon className="w-3 h-3" />
                            {roleMeta.label}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.kitchenRole ? (
                          <Badge variant="outline" className="text-xs">
                            {KITCHEN_ROLE_LABELS[user.kitchenRole]}
                            {user.cafeName ? ` · ${user.cafeName}` : ""}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize", STATUS_STYLES[user.status] ?? "bg-muted text-muted-foreground")}>
                          {STATUS_LABELS[user.status] ?? user.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {user.lastSignIn
                          ? formatDistanceToNow(parseISO(user.lastSignIn), { addSuffix: true, locale: fr })
                          : user.invitedAt
                            ? `Invité·e ${formatDistanceToNow(parseISO(user.invitedAt), { addSuffix: true, locale: fr })}`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setRoleChangeUser(user); setNewRole(user.role ?? "user"); }}>
                              Changer le rôle Café
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setKitchenEditUser(user);
                                setEditKitchenRole(user.kitchenRole ?? "none");
                                setEditCafeId(user.cafeId ?? "");
                              }}
                            >
                              Modifier l'accès Cuisine
                            </DropdownMenuItem>
                            {user.status === "invited" && (
                              <DropdownMenuItem onClick={() => void handleAction("resend-invite", user)}>
                                Renvoyer l'invitation
                              </DropdownMenuItem>
                            )}
                            {user.role === null ? (
                              <p className="px-2 py-1.5 text-xs text-muted-foreground max-w-[200px]">
                                Les utilisateurs Cuisine uniquement se retirent avec « Supprimer l'utilisateur ».
                              </p>
                            ) : user.status === "active" ? (
                              <DropdownMenuItem onClick={() => setConfirmAction({ type: "disable", user })}>
                                Désactiver l'accès
                              </DropdownMenuItem>
                            ) : user.status === "disabled" ? (
                              <DropdownMenuItem onClick={() => void handleAction("enable", user)}>
                                Réactiver l'accès
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setConfirmAction({ type: "remove", user })}
                            >
                              Supprimer l'utilisateur
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Cafés */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-lg font-medium text-foreground">Cafés</h2>
        <div className="space-y-2">
          {cafes.length === 0 && <p className="text-sm text-muted-foreground">Aucun café pour l'instant.</p>}
          {cafes.map((cafe) => (
            <div key={cafe.id} className={cn("flex items-center gap-2", !cafe.isActive && "opacity-60")}>
              {editingCafe?.id === cafe.id ? (
                <>
                  <Input
                    className="h-8 max-w-xs"
                    value={editingCafe.name}
                    onChange={(e) => setEditingCafe({ id: cafe.id, name: e.target.value })}
                  />
                  <Button
                    size="sm"
                    disabled={!editingCafe.name.trim()}
                    onClick={() => {
                      void saveCafe({ id: cafe.id, name: editingCafe.name, isActive: cafe.isActive });
                      setEditingCafe(null);
                    }}
                  >
                    Enregistrer
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingCafe(null)}>Annuler</Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-foreground">{cafe.name}</span>
                  {!cafe.isActive && <Badge variant="outline" className="text-[10px]">Inactif</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => setEditingCafe({ id: cafe.id, name: cafe.name })}>
                    Renommer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void saveCafe({ id: cafe.id, name: cafe.name, isActive: !cafe.isActive })}
                  >
                    {cafe.isActive ? "Désactiver" : "Activer"}
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <Input
            className="h-8 max-w-xs"
            placeholder="Nom du nouveau café"
            value={newCafeName}
            onChange={(e) => setNewCafeName(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!newCafeName.trim()}
            onClick={() => {
              void saveCafe({ name: newCafeName, isActive: true });
              setNewCafeName("");
            }}
          >
            Ajouter un café
          </Button>
        </div>
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
            <DialogDescription>Envoyer une invitation par e-mail avec ses accès.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">E-mail</label>
              <Input
                type="email"
                placeholder="collegue@exemple.fr"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Accès Café (torréfaction B2B)</label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole | "none")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pas d'accès Café</SelectItem>
                  <SelectItem value="user">Client — commande du café</SelectItem>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /> Admin — accès complet</span>
                  </SelectItem>
                  <SelectItem value="roaster">
                    <span className="flex items-center gap-2"><Flame className="w-3.5 h-3.5" /> Torréfaction — vue production uniquement</span>
                  </SelectItem>
                  <SelectItem value="packaging">
                    <span className="flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Conditionnement — vue conditionnement uniquement</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Accès Cuisine</label>
              <Select value={inviteKitchenRole} onValueChange={(v) => setInviteKitchenRole(v as KitchenRole | "none")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  <SelectItem value="coffee_manager">Responsable café</SelectItem>
                  <SelectItem value="stores_manager">Responsable des boutiques</SelectItem>
                  <SelectItem value="kitchen_manager">Responsable cuisine</SelectItem>
                </SelectContent>
              </Select>
              {inviteKitchenRole === "coffee_manager" && (
                <Select value={inviteCafeId} onValueChange={setInviteCafeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un café" />
                  </SelectTrigger>
                  <SelectContent>
                    {cafes.filter((c) => c.isActive).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                {inviteRole === "none" && "Pas d'accès aux commandes de café."}
                {inviteRole === "user" && "Peut commander du café comme client."}
                {inviteRole === "admin" && "Accès complet à toutes les sections : commandes, torréfaction, conditionnement, facturation, clients, produits et réglages."}
                {inviteRole === "roaster" && "Voit uniquement la section Torréfaction : quantités à torréfier et avancement. Pas d'accès aux prix, clients ni à la facturation."}
                {inviteRole === "packaging" && "Voit uniquement la section Conditionnement et peut suivre le conditionnement. Pas d'accès aux prix, clients ni à la facturation."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Annuler</Button>
              <Button onClick={() => void handleInvite()} disabled={inviting || !inviteEmail.trim()} className="gap-2">
                {inviting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Envoyer l'invitation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Role change dialog */}
      <Dialog open={Boolean(roleChangeUser)} onOpenChange={(open) => !open && setRoleChangeUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Changer le rôle Café</DialogTitle>
            <DialogDescription>Rôle Café de {roleChangeUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="roaster">Torréfaction</SelectItem>
                <SelectItem value="packaging">Conditionnement</SelectItem>
                <SelectItem value="user">Client</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRoleChangeUser(null)}>Annuler</Button>
              <Button onClick={() => void handleRoleChange()}>Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kitchen access dialog */}
      <Dialog open={Boolean(kitchenEditUser)} onOpenChange={(open) => !open && setKitchenEditUser(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Accès Cuisine</DialogTitle>
            <DialogDescription>Accès Cuisine de {kitchenEditUser?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select value={editKitchenRole} onValueChange={(v) => setEditKitchenRole(v as KitchenRole | "none")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                <SelectItem value="coffee_manager">Responsable café</SelectItem>
                <SelectItem value="stores_manager">Responsable des boutiques</SelectItem>
                <SelectItem value="kitchen_manager">Responsable cuisine</SelectItem>
              </SelectContent>
            </Select>
            {editKitchenRole === "coffee_manager" && (
              <Select value={editCafeId} onValueChange={setEditCafeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un café" />
                </SelectTrigger>
                <SelectContent>
                  {cafes.filter((c) => c.isActive || c.id === editCafeId).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setKitchenEditUser(null)}>Annuler</Button>
              <Button onClick={() => void handleKitchenEdit()}>Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm action dialog */}
      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "remove" ? "Supprimer l'utilisateur" : "Désactiver l'accès"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "remove"
                ? `Supprimer ${confirmAction.user.email} ? Cette personne perdra tous ses accès.`
                : `Désactiver l'accès de ${confirmAction?.user.email} ?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmAction && void handleAction(confirmAction.type, confirmAction.user)}>
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

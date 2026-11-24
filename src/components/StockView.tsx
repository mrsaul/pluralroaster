import { useUrlState } from "@/hooks/useUrlState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RoastingNeedsTab } from "@/components/stock/RoastingNeedsTab";
import { useRoastingNeeds } from "@/hooks/useRoasting";
import { StockListTab } from "@/components/stock/StockListTab";

export function StockView() {
  const [tabRaw, setTab] = useUrlState("st", "roast");
  const tab = tabRaw === "stock" ? "stock" : "roast";
  const { needs, inputs, error, isLoading } = useRoastingNeeds();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Stock</h2>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="roast">
            {needs ? `À torréfier (${needs.length})` : "À torréfier"}
          </TabsTrigger>
          <TabsTrigger value="stock">Stock torréfié</TabsTrigger>
        </TabsList>
        <TabsContent value="roast" className="mt-4">
          <RoastingNeedsTab
            needs={needs}
            error={error}
            isLoading={isLoading}
            defaultPercent={inputs?.defaultPercent}
          />
        </TabsContent>
        <TabsContent value="stock" className="mt-4">
          <StockListTab />
        </TabsContent>
      </Tabs>
    </section>
  );
}

import {
  AppCard,
  AppHeader,
  AppLogo,
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CategoryChips,
  Checkbox,
  Chip,
  CodeBlock,
  CollectionCard,
  Container,
  Description,
  DetailList,
  DetailRow,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuThemeRow,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  FieldError,
  FilterChip,
  FlowCard,
  FlowStepItem,
  FlowStrip,
  Input,
  KeyValue,
  KeyValueGroup,
  Kbd,
  KbdGroup,
  Label,
  Logo,
  LogoMark,
  Optional,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
  Progress,
  ScreenGrid,
  ScreenTile,
  SearchPill,
  SectionHeader,
  SegmentedControl,
  Select,
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  SortableList,
  Spinner,
  Stat,
  StatusBadge,
  Steps,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TabNav,
  TabNavItem,
  Tabs,
  TabsList,
  TabsPanel,
  Textarea,
  ThemeToggle,
  Tooltip,
  UploadDropzone,
  UploadItem,
  toast,
} from "@screen-commons/ui";
import { CATEGORIES } from "@screen-commons/core/taxonomy";
import {
  Bookmark,
  Copy,
  Ellipsis,
  Info,
  Inbox,
  Key,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import * as React from "react";

import {
  apps,
  appBySlug,
  collections,
  flows,
  flowSummaries,
  mobileScreens,
  webScreens,
} from "../mock-data";

const sections = [
  ["foundations", "Foundations"],
  ["buttons", "Buttons"],
  ["forms", "Forms"],
  ["navigation", "Chips & tabs"],
  ["overlays", "Overlays"],
  ["feedback", "Feedback"],
  ["data", "Layout & data"],
  ["library", "Library components"],
  ["contribute", "Contribute"],
] as const;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-12 pb-4">
      <SectionHeader title={title} description={description} size="lg" className="mb-8" />
      <div className="flex flex-col gap-10">{children}</div>
    </section>
  );
}

function Demo({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-fg-muted">{label}</div>
      <div className={className ?? "flex flex-wrap items-center gap-3"}>{children}</div>
    </div>
  );
}

const swatches = [
  ["bg", "bg-bg border border-border"],
  ["fg", "bg-fg"],
  ["fg-muted", "bg-fg-muted"],
  ["fg-subtle", "bg-fg-subtle"],
  ["tile", "bg-tile"],
  ["muted-strong", "bg-muted-strong"],
  ["border-strong", "bg-border-strong"],
  ["inverse", "bg-inverse"],
  ["chrome", "bg-chrome"],
  ["accent", "bg-accent"],
  ["success", "bg-success"],
  ["warning", "bg-warning"],
  ["danger", "bg-danger"],
] as const;

const typeScale = [
  ["3xl · 56", "text-3xl font-semibold", "Real screens"],
  ["2xl · 40", "text-2xl font-semibold", "Discover"],
  ["xl · 28", "text-xl font-semibold", "Onboarding on Tally"],
  ["lg · 20", "text-lg font-semibold", "Recently added"],
  ["md · 16", "text-md", "Distraction-free notes, drafts and long-form writing."],
  ["base · 14", "text-base", "UI text: buttons, inputs, tabs, menu items."],
  ["sm · 13", "text-sm text-fg-muted", "Secondary text, metadata, captions · 1,284 screens"],
  ["xs · 12", "text-xs text-fg-muted", "Badges and keyboard hints"],
] as const;

export function ComponentsPage() {
  const [segment, setSegment] = React.useState("web");
  const [category, setCategory] = React.useState<string | null>("finance");
  const [chips, setChips] = React.useState<Set<string>>(new Set(["Login", "Pricing"]));
  const [selectValue, setSelectValue] = React.useState("latest");
  const [menuRadio, setMenuRadio] = React.useState("latest");
  const [menuCheck, setMenuCheck] = React.useState(true);
  const [steps, setSteps] = React.useState(() =>
    flows[0]!.steps.map((step) => ({
      id: step.screen.id,
      thumb: step.screen.thumbUrl,
      label: step.label ?? "",
    })),
  );
  const [loading, setLoading] = React.useState(false);
  const [selectedTile, setSelectedTile] = React.useState(true);

  return (
    <Container className="pt-10 pb-24 sm:pt-12">
      <PageHeader
        title="Screen Commons design system"
        description="Quiet, content-first components for the Screen Commons library. Every token, primitive and library component, rendered with synthetic data."
        actions={<ThemeToggle size="md" />}
      />
      <nav aria-label="Sections" className="mt-8 mb-4 flex flex-wrap gap-2">
        {sections.map(([id, label]) => (
          <Chip
            key={id}
            tone="soft"
            render={
              <a
                href={`#/components`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            }
          >
            {label}
          </Chip>
        ))}
      </nav>

      <Section
        id="foundations"
        title="Foundations"
        description="Neutral palette, one accent, Inter Variable, 20px tiles, pill controls."
      >
        <Demo label="Logo" className="flex flex-wrap items-center gap-10">
          <Logo size="lg" />
          <Logo />
          <Logo size="sm" />
          <LogoMark size={32} title="Screen Commons" />
          <span className="flex size-12 items-center justify-center rounded-[12px] bg-inverse text-inverse-fg">
            <LogoMark size={24} />
          </span>
        </Demo>
        <Demo
          label="Color tokens"
          className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-13"
        >
          {swatches.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-2">
              <div className={`h-14 rounded-control ${cls}`} />
              <code className="text-xs text-fg-muted">{name}</code>
            </div>
          ))}
        </Demo>
        <Demo label="Type scale" className="flex flex-col gap-4">
          {typeScale.map(([label, cls, text]) => (
            <div key={label} className="flex items-baseline gap-6">
              <code className="w-20 shrink-0 text-xs text-fg-subtle">{label}</code>
              <span className={`${cls} min-w-0 truncate`}>{text}</span>
            </div>
          ))}
        </Demo>
        <Demo label="Radii" className="flex flex-wrap items-end gap-6">
          {[
            ["shot · 8", "rounded-shot"],
            ["control · 10", "rounded-control"],
            ["card · 14", "rounded-card"],
            ["tile · 20", "rounded-tile"],
            ["pill", "rounded-pill"],
          ].map(([label, cls]) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div className={`size-20 bg-tile ${cls}`} />
              <code className="text-xs text-fg-muted">{label}</code>
            </div>
          ))}
        </Demo>
      </Section>

      <Section
        id="buttons"
        title="Buttons"
        description="Black pill primary; secondary, outline and ghost for everything else."
      >
        <Demo label="Variants">
          <Button>Save</Button>
          <Button variant="secondary">Filters</Button>
          <Button variant="outline">Visit site</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Revoke key</Button>
          <Button variant="link">Learn more</Button>
        </Demo>
        <Demo label="Sizes & icons">
          <Button size="sm">
            <Plus />
            Contribute
          </Button>
          <Button size="md">
            <Bookmark />
            Save
          </Button>
          <Button size="lg">Get started</Button>
          <Tooltip content="More actions">
            <Button variant="outline" icon aria-label="More actions">
              <Ellipsis />
            </Button>
          </Tooltip>
          <Tooltip content="Copy image" shortcut="C">
            <Button variant="secondary" icon aria-label="Copy image">
              <Copy />
            </Button>
          </Tooltip>
          <Button variant="ghost" icon size="sm" aria-label="Settings">
            <Settings />
          </Button>
        </Demo>
        <Demo label="States">
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1600);
            }}
          >
            {loading ? "Uploading…" : "Click to load"}
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" shape="rounded">
            Rounded shape
          </Button>
        </Demo>
      </Section>

      <Section
        id="forms"
        title="Forms"
        description="Filled controls that turn white with an accent ring on focus."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <Demo label="Field" className="flex flex-col gap-5">
            <Field>
              <Label>App name</Label>
              <Input placeholder="Linear" defaultValue="Northwind" />
              <Description>Shown on cards and in search results.</Description>
            </Field>
            <Field invalid>
              <Label>Website</Label>
              <Input placeholder="https://" defaultValue="northwind" aria-invalid />
              <FieldError match>Enter a full URL, e.g. https://northwind.app</FieldError>
            </Field>
            <Field>
              <Label>
                Tagline <Optional />
              </Label>
              <Textarea placeholder="What does the product do, in one line?" rows={3} />
            </Field>
          </Demo>
          <Demo label="Inputs & selects" className="flex flex-col gap-5">
            <Input leading={<Search />} placeholder="Search apps…" trailing={<Kbd>/</Kbd>} />
            <Input size="sm" placeholder="Small input" />
            <Select
              aria-label="Category"
              placeholder="Choose a category"
              options={CATEGORIES.map((c) => ({ value: c.slug, label: c.label }))}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Select
                variant="pill"
                aria-label="Sort"
                value={selectValue}
                onValueChange={setSelectValue}
                options={[
                  { value: "latest", label: "Latest" },
                  { value: "popular", label: "Most popular" },
                ]}
              />
              <Select
                variant="ghost"
                aria-label="Version"
                defaultValue="oct"
                options={[
                  { value: "oct", label: "Oct 2026" },
                  { value: "jul", label: "Jul 2026" },
                ]}
              />
            </div>
          </Demo>
          <Demo label="Choice controls" className="flex flex-col gap-4">
            <Checkbox
              label="Publish immediately"
              description="Admins skip the review queue."
              defaultChecked
            />
            <Checkbox label="Indeterminate" indeterminate />
            <Switch
              label="Weekly digest"
              description="A summary of new apps every Monday."
              defaultChecked
            />
            <Switch label="Compact grid" />
          </Demo>
          <Demo label="Segmented control" className="flex flex-col items-start gap-4">
            <SegmentedControl
              aria-label="Platform"
              value={segment}
              onValueChange={setSegment}
              options={[
                { value: "web", label: "Web" },
                { value: "ios", label: "iOS" },
                { value: "android", label: "Android" },
              ]}
            />
            <SegmentedControl
              aria-label="View"
              size="sm"
              defaultValue="screens"
              options={[
                { value: "screens", label: "Screens" },
                { value: "prototype", label: "Prototype" },
              ]}
            />
            <ThemeToggle />
          </Demo>
        </div>
      </Section>

      <Section
        id="navigation"
        title="Chips & tabs"
        description="Underline tabs, pill chips, keyboard hints."
      >
        <Demo label="Search pill" className="max-w-xl">
          <SearchPill placeholder="Search Web apps, screens, flows…" />
        </Demo>
        <Demo label="Route tabs (TabNav)">
          <TabNav aria-label="Demo tabs">
            <TabNavItem active href="#/components">
              Apps
            </TabNavItem>
            <TabNavItem href="#/components">Screens</TabNavItem>
            <TabNavItem href="#/components">UI Elements</TabNavItem>
            <TabNavItem href="#/components" badge={<Badge tone="inverse">New</Badge>}>
              Flows
            </TabNavItem>
          </TabNav>
        </Demo>
        <Demo label="Panel tabs (Tabs)" className="block">
          <Tabs defaultValue="screens">
            <TabsList aria-label="App sections" bordered>
              <Tab value="screens">Screens</Tab>
              <Tab value="elements">UI Elements</Tab>
              <Tab value="flows">Flows</Tab>
            </TabsList>
            <TabsPanel value="screens" className="text-fg-muted">
              Screens panel — arrow keys move between tabs.
            </TabsPanel>
            <TabsPanel value="elements" className="text-fg-muted">
              UI elements panel.
            </TabsPanel>
            <TabsPanel value="flows" className="text-fg-muted">
              Flows panel.
            </TabsPanel>
          </Tabs>
        </Demo>
        <Demo label="Category row" className="block">
          <CategoryChips
            aria-label="Categories"
            items={CATEGORIES.map((c) => ({ value: c.slug, label: c.label }))}
            value={category}
            onValueChange={setCategory}
            leading={
              <Button variant="secondary" className="h-9">
                <SlidersHorizontal />
                Filters
              </Button>
            }
          />
        </Demo>
        <Demo label="Chips">
          {["Login", "Pricing", "Dashboard", "Onboarding"].map((label) => (
            <FilterChip
              key={label}
              size="sm"
              selected={chips.has(label)}
              onSelectedChange={(next) =>
                setChips((prev) => {
                  const copy = new Set(prev);
                  if (next) copy.add(label);
                  else copy.delete(label);
                  return copy;
                })
              }
            >
              {label}
            </FilterChip>
          ))}
          <Separator orientation="vertical" className="h-6" />
          <Chip>Text Field</Chip>
          <Chip tone="soft">Table</Chip>
          <Chip tone="solid">Modal</Chip>
          <Chip onRemove={() => toast("Removed tag")}>Removable</Chip>
        </Demo>
        <Demo label="Badges & keys">
          <Badge>12 screens</Badge>
          <Badge tone="inverse">PRO</Badge>
          <Badge tone="accent">Beta</Badge>
          <StatusBadge status="published" />
          <StatusBadge status="pending" />
          <StatusBadge status="rejected" />
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
          <Kbd>Esc</Kbd>
        </Demo>
      </Section>

      <Section
        id="overlays"
        title="Overlays"
        description="Dialog, sheet, popover, menu, tooltip, toast. The command palette opens with ⌘K or the search pill."
      >
        <Demo label="Triggers">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  Keys authenticate the browser extension, MCP server and scripts.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <Field>
                  <Label>Name</Label>
                  <Input placeholder="e.g. Laptop MCP" autoFocus />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button variant="ghost">Cancel</Button>
                <Button>Create key</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>Open sheet</SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Narrow results by pattern and element.</SheetDescription>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-4">
                <Checkbox label="Has flows" defaultChecked />
                <Checkbox label="Dark mode screens" />
                <Checkbox label="Updated this month" />
              </SheetBody>
              <SheetFooter>
                <Button variant="ghost">Reset</Button>
                <Button>Show 248 results</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>Popover</PopoverTrigger>
            <PopoverContent className="w-72">
              <PopoverTitle>How search works</PopoverTitle>
              <PopoverDescription className="mt-1">
                We match app names, screen titles, patterns and UI elements. Use quotes for exact
                phrases.
              </PopoverDescription>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>Menu</DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={menuRadio}
                  onValueChange={(v) => setMenuRadio(v as string)}
                >
                  <DropdownMenuRadioItem value="latest">Latest</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="popular">Most popular</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={menuCheck} onCheckedChange={setMenuCheck}>
                Show app names
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Key />} hint="⌘K">
                API keys
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Trash2 />} destructive>
                Delete collection
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuThemeRow />
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip content="Saved">
            <Button variant="ghost" icon aria-label="Saved">
              <Bookmark />
            </Button>
          </Tooltip>
          <Button
            variant="secondary"
            onClick={() =>
              toast("Saved to collection", { action: { label: "Undo", onClick: () => undefined } })
            }
          >
            Toast
          </Button>
          <Button variant="secondary" onClick={() => toast.success("API key created")}>
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast.error("Upload failed — file is over 15 MB")}
          >
            Error toast
          </Button>
        </Demo>
      </Section>

      <Section
        id="feedback"
        title="Feedback"
        description="Skeletons match real geometry; empty states are quiet and offer one action."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <Demo label="Loading" className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Spinner />
              <Spinner size={20} />
              <Progress value={62} className="max-w-60" />
              <Progress className="max-w-40" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-[9px]" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </Demo>
          <Demo label="Callouts" className="flex flex-col gap-3">
            <Callout icon={<Info />}>
              Members’ contributions are reviewed before they’re published.
            </Callout>
            <Callout tone="warning" icon={<TriangleAlert />}>
              This key is shown once. Copy it now.
            </Callout>
          </Demo>
        </div>
        <Demo label="Empty state" className="block">
          <EmptyState
            tone="tile"
            icon={<Inbox />}
            title="Nothing saved yet"
            description="Save screens, flows and apps to build your own reference collections."
            actions={<Button>Browse apps</Button>}
          />
        </Demo>
      </Section>

      <Section id="data" title="Layout & data">
        <div className="grid gap-8 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Browser extension</CardTitle>
              <CardDescription>Capture full pages and flows from any site.</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeBlock
                title="MCP config"
                code={`{\n  "mcpServers": {\n    "screen-commons": { "command": "node", "args": ["/path/to/screen-commons/packages/mcp/dist/index.js"] }\n  }\n}`}
              />
            </CardContent>
            <CardFooter>
              <Button variant="ghost">Docs</Button>
              <Button>Install</Button>
            </CardFooter>
          </Card>
          <div className="flex flex-col gap-8">
            <Demo label="Stats" className="flex flex-wrap gap-12">
              <Stat label="Screens" value="12,480" />
              <Stat label="Apps" value="318" />
              <Stat label="Flows" value="1,206" hint="+42 this week" />
            </Demo>
            <Demo label="Key / value" className="block">
              <KeyValueGroup>
                <KeyValue label="Platform">Web</KeyValue>
                <KeyValue label="Category">Business</KeyValue>
                <KeyValue label="Screens">60</KeyValue>
              </KeyValueGroup>
            </Demo>
            <Demo label="Detail list" className="block max-w-sm">
              <DetailList>
                <DetailRow label="Size">1440 × 900</DetailRow>
                <DetailRow label="Version">Oct 2026</DetailRow>
                <DetailRow label="Captured">Oct 6, 2026</DetailRow>
              </DetailList>
            </Demo>
            <Demo label="Avatars">
              <Avatar name="Mira Okafor" size="lg" />
              <Avatar name="Sam Lee" />
              <Avatar name="Ada" size="sm" />
              <Avatar name="Jo" size="xs" />
            </Demo>
          </div>
        </div>
        <Demo label="Table" className="block">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Key</TableHeaderCell>
                <TableHeaderCell>Last used</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[
                ["Browser extension", "oui_7f3a", "2 minutes ago"],
                ["Laptop MCP", "oui_c19d", "Yesterday"],
                ["CI seed", "oui_44be", "Never"],
              ].map(([name, prefix, used]) => (
                <TableRow key={prefix}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell>
                    <code className="text-sm text-fg-muted">{prefix}••••</code>
                  </TableCell>
                  <TableCell className="text-fg-muted">{used}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Demo>
      </Section>

      <Section
        id="library"
        title="Library components"
        description="Typed against @screen-commons/core entities. Presentational only — no data fetching."
      >
        <Demo label="App logos">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size) => (
            <AppLogo key={size} app={apps[0]!} size={size} />
          ))}
          <AppLogo app={{ name: "Fallback", accentColor: "#f2c94c" }} size="lg" />
          <AppLogo app={{ name: "Neutral" }} size="lg" />
        </Demo>
        <Demo
          label="Screen tiles — web (tile) and mobile (bare)"
          className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_1fr_1fr]"
        >
          <ScreenTile
            screen={webScreens[1]!}
            showApp
            onSaveToggle={() => undefined}
            selectable
            selected={selectedTile}
            onSelectedChange={setSelectedTile}
          />
          <ScreenTile screen={mobileScreens[4]!} onSaveToggle={() => undefined} />
          <ScreenTile screen={mobileScreens[5]!} caption />
        </Demo>
        <Demo label="App cards" className="block">
          <ScreenGrid columns="apps-web">
            {apps.slice(0, 3).map((app) => (
              <AppCard key={app.id} app={app} onSaveToggle={() => undefined} />
            ))}
          </ScreenGrid>
        </Demo>
        <Demo label="Flow cards" className="block">
          <ScreenGrid columns="flows">
            {flowSummaries.slice(0, 3).map((flow) => (
              <FlowCard key={flow.id} flow={flow} />
            ))}
          </ScreenGrid>
        </Demo>
        <Demo label="Flow strip" className="-mx-6 block md:-mx-8">
          <FlowStrip
            steps={flows[0]!.steps}
            size="md"
            activeIndex={1}
            onStepClick={() => undefined}
          />
        </Demo>
        <Demo label="Collections" className="block">
          <ScreenGrid columns="apps-mobile">
            {collections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </ScreenGrid>
        </Demo>
        <Demo label="App header" className="block">
          <AppHeader
            app={appBySlug.tally!}
            actions={
              <>
                <Button>
                  <Bookmark />
                  Save
                </Button>
                <Button variant="outline" icon aria-label="More">
                  <Ellipsis />
                </Button>
              </>
            }
          />
        </Demo>
      </Section>

      <Section
        id="contribute"
        title="Contribute"
        description="Upload, reorder into a flow, label steps."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <Demo label="Dropzone" className="flex flex-col gap-4">
            <UploadDropzone
              onFiles={(files) => toast(`${files.length} file(s) added`)}
              onReject={(r) => toast.error(`${r.length} file(s) rejected`)}
              acceptPaste={false}
            />
            <UploadDropzone
              onFiles={() => undefined}
              status="uploading"
              progress={45}
              size="md"
              acceptPaste={false}
            />
          </Demo>
          <div className="flex flex-col gap-8">
            <Demo label="Wizard steps" className="block">
              <Steps
                current={2}
                onStepClick={() => undefined}
                steps={[
                  { id: "upload", label: "Upload" },
                  { id: "app", label: "App" },
                  { id: "tags", label: "Tags" },
                  { id: "flow", label: "Flow" },
                  { id: "review", label: "Review" },
                ]}
              />
            </Demo>
            <Demo label="Upload queue" className="flex flex-col gap-2">
              <UploadItem
                name="pricing.png"
                previewUrl={webScreens[2]!.thumbUrl}
                bytes={1_240_000}
                status="done"
                onRemove={() => undefined}
              />
              <UploadItem
                name="dashboard-dark.png"
                previewUrl={webScreens[1]!.thumbUrl}
                status="uploading"
                progress={64}
              />
              <UploadItem
                name="huge.png"
                status="error"
                error="File is over 15 MB"
                onRemove={() => undefined}
              />
            </Demo>
            <Demo
              label="Flow steps (drag the grip, or focus it and use Space + arrows)"
              className="block"
            >
              <SortableList
                aria-label="Flow steps"
                items={steps}
                getId={(step) => step.id}
                getLabel={(step, index) =>
                  `step ${index + 1}${step.label ? `, ${step.label}` : ""}`
                }
                onReorder={setSteps}
                renderItem={(step, { index, handle, isDragging }) => (
                  <FlowStepItem
                    index={index}
                    thumbUrl={step.thumb}
                    label={step.label}
                    handle={handle}
                    isDragging={isDragging}
                    onLabelChange={(label) =>
                      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, label } : s)))
                    }
                    onRemove={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                  />
                )}
              />
            </Demo>
          </div>
        </div>
      </Section>
    </Container>
  );
}

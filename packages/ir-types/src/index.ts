export type IrVersion = `${number}.${number}.${number}`;

export interface SourceSpan {
  file: string;
  line_start: number; // 1-indexed
  line_end: number;   // 1-indexed
}

export interface AppMeta {
  entry_file: string;
  framework: "streamlit";
  streamlit_version: string;
  python_version: string;
  dependencies: string[];
  env_vars: string[];
  repo: {
    source: "github" | "upload";
    ref: string;
    commit: string;
  };
}

export type ContainerType = "sidebar" | "main" | "form";

export interface UiContainerNode {
  id: string;
  kind: "container";
  container_type: ContainerType;
  children: UiNode[];
  source_span?: SourceSpan;
}

export type InputWidget =
  | "selectbox"
  | "multiselect"
  | "slider"
  | "text_input"
  | "number_input"
  | "date_input"
  | "checkbox";

export type DataType = "date" | "number" | "string" | "boolean";
export type AtomType = DataType | "list" | "object";

export interface UiInputNode {
  id: string;
  kind: "input";
  widget: InputWidget;
  label: string;
  binds_to: string;
  data_type: DataType;
  default?: unknown;
  key?: string;
  source_span?: SourceSpan;
}

export type OutputWidget = "dataframe" | "table" | "metric" | "chart";

export interface UiOutputNode {
  id: string;
  kind: "output";
  widget: OutputWidget;
  source: string;
  source_span?: SourceSpan;
}

export type UiNode = UiContainerNode | UiInputNode | UiOutputNode;

export type StateAtomSource = "ui" | "session_state" | "computed";

export interface StateAtom {
  data_type: AtomType;
  source: StateAtomSource;
}

export interface DerivedAtom {
  depends_on: string[];
  computed_by: string;
}

export interface SessionAtom {
  data_type: AtomType;
  writes: string[];
  reads: string[];
}

export interface StateModel {
  inputs: Record<string, StateAtom>;
  derived: Record<string, DerivedAtom>;
  session: Record<string, SessionAtom>;
}

export type SideEffect = "file_io" | "network" | "model_load";

export interface ComputeNode {
  id: string;
  kind: "function";
  source_span: SourceSpan;
  inputs: string[];
  outputs: string[];
  side_effects: SideEffect[];
  candidate_for_backend: boolean;
}

export type HttpMethod = "POST";

export interface EndpointSpec {
  name: string;
  method: HttpMethod;
  path: string; // must start with /api/
  source_function: string;
  request_schema: string;
  response_schema: string;
}

export type SchemaDef = Record<string, string>;

export interface BackendPlan {
  endpoints: EndpointSpec[];
  schemas: Record<string, SchemaDef>;
}

export type ModelType = "sklearn" | "torch" | "xgboost";

export interface ModelAsset {
  name: string;
  type: ModelType;
  path: string;
  loaded_by: string;
}

export type DataSourceType = "csv" | "parquet" | "database";
export type DataAccess = "read";

export interface DataSource {
  type: DataSourceType;
  path: string;
  access: DataAccess;
}

export interface Assets {
  models: ModelAsset[];
  data_sources: DataSource[];
}

export type WarningSeverity = "low" | "medium" | "high";
export type WarningCategory = "unsupported" | "ambiguity" | "performance";

export interface IrWarning {
  severity: WarningSeverity;
  category: WarningCategory;
  message: string;
  suggestion: string;
  source_span?: SourceSpan;
}

export interface IR {
  ir_version: IrVersion;
  generated_at: string; // ISO 8601
  app: AppMeta;
  ui_tree: UiNode[];
  state: StateModel;
  compute_graph: ComputeNode[];
  backend_plan: BackendPlan;
  assets: Assets;
  warnings: IrWarning[];
}
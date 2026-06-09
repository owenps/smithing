use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use uuid::Uuid;

use super::{
    developer_environment::DeveloperEnvironment, sanitize_resume_metadata, PersistedTile,
    TerminalLaunchRequest, TileResumeMetadata, WorkspaceState,
};

pub(crate) const CORE_EXTENSION_ID: &str = "fluidity.core";
pub(crate) const EXTENSION_DEFINITION_FILE: &str = "fluidity.extension.json";
const INTEGRATION_CATALOG_JSON: &str = include_str!("../../src/shared/integrationCatalog.json");

#[derive(Debug, Clone, Deserialize)]
struct IntegrationCatalog {
    integrations: Vec<IntegrationCatalogIntegration>,
}

#[derive(Debug, Clone, Deserialize)]
struct IntegrationCatalogIntegration {
    id: String,
    title: String,
    tiles: Vec<IntegrationCatalogTile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntegrationCatalogTile {
    id: String,
    title: String,
    kind: String,
    #[serde(default)]
    default_visible: bool,
    icon_key: Option<String>,
    tool_command: Option<String>,
    resume_provider: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ToolIntegrationTile {
    pub(crate) extension_id: String,
    pub(crate) integration_id: String,
    pub(crate) integration_tile_id: String,
    pub(crate) title: String,
    pub(crate) default_visible: bool,
    pub(crate) icon: Option<ExtensionIcon>,
    pub(crate) command_argv: Vec<String>,
    pub(crate) resume: ToolResumeStrategy,
    pub(crate) provenance: ExtensionContributionProvenance,
}

#[derive(Debug, Clone)]
pub(crate) enum ToolResumeStrategy {
    CoreProvider { provider: String },
    None,
    SessionIdArg { provider: String, arg: String },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionDefinition {
    schema_version: u32,
    id: String,
    title: String,
    icon: Option<ExtensionIcon>,
    contributes: ExtensionContributes,
}

#[derive(Debug, Clone, Deserialize)]
struct ExtensionContributes {
    integrations: Vec<ExtensionIntegrationContribution>,
}

#[derive(Debug, Clone, Deserialize)]
struct ExtensionIntegrationContribution {
    id: String,
    title: String,
    icon: Option<ExtensionIcon>,
    tiles: Vec<ExtensionIntegrationTileContribution>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExtensionIntegrationTileContribution {
    id: String,
    kind: String,
    title: String,
    #[serde(default)]
    default_visible: bool,
    icon: Option<ExtensionIcon>,
    command: ExtensionCommand,
    resume: Option<ExtensionResume>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub(crate) enum ExtensionIcon {
    Key { key: String },
    Path { path: String },
}

#[derive(Debug, Clone, Deserialize)]
struct ExtensionCommand {
    argv: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "strategy", rename_all = "kebab-case")]
enum ExtensionResume {
    None,
    SessionIdArg { arg: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ToolAvailabilityStatus {
    Available,
    Unavailable,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolAvailabilityResponse {
    pub(crate) extension_id: String,
    pub(crate) integration_id: String,
    pub(crate) integration_tile_id: String,
    pub(crate) title: String,
    pub(crate) command: String,
    pub(crate) status: ToolAvailabilityStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) resolved_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) detail: Option<String>,
    pub(crate) provenance: ExtensionContributionProvenance,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionSettingsResponse {
    pub(crate) extensions: Vec<ExtensionSettingsEntry>,
    pub(crate) diagnostics: Vec<ExtensionDiagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionSettingsEntry {
    pub(crate) source_kind: String,
    pub(crate) extension_id: String,
    pub(crate) title: String,
    pub(crate) status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_root: Option<String>,
    pub(crate) diagnostics: Vec<ExtensionDiagnostic>,
    pub(crate) tiles: Vec<ExtensionSettingsTile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionSettingsTile {
    integration_id: String,
    integration_tile_id: String,
    title: String,
    default_visible: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IntegrationCatalogResponse {
    pub(crate) tiles: Vec<IntegrationCatalogTileResponse>,
    pub(crate) diagnostics: Vec<ExtensionDiagnostic>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IntegrationCatalogTileResponse {
    pub(crate) extension_id: String,
    pub(crate) integration_id: String,
    pub(crate) integration_tile_id: String,
    pub(crate) title: String,
    pub(crate) default_visible: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) icon: Option<ExtensionIconResponse>,
    pub(crate) provenance: ExtensionContributionProvenance,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum ExtensionIconResponse {
    Key { key: String, fallback_text: String },
    Path { path: String, fallback_text: String },
    Text { fallback_text: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionContributionProvenance {
    pub(crate) source_kind: String,
    pub(crate) extension_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_root: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExtensionDiagnostic {
    pub(crate) severity: String,
    pub(crate) message: String,
    pub(crate) source_kind: String,
    pub(crate) extension_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manifest_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_root: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ExtensionCatalogSnapshot {
    pub(crate) tiles: Vec<ToolIntegrationTile>,
    pub(crate) diagnostics: Vec<ExtensionDiagnostic>,
    pub(crate) extensions: Vec<ExtensionSettingsEntry>,
}

impl ExtensionCatalogSnapshot {
    pub(crate) fn into_catalog_response(self) -> IntegrationCatalogResponse {
        IntegrationCatalogResponse {
            tiles: self
                .tiles
                .into_iter()
                .map(integration_catalog_tile_response)
                .collect(),
            diagnostics: self.diagnostics,
        }
    }

    pub(crate) fn into_settings_response(self) -> ExtensionSettingsResponse {
        ExtensionSettingsResponse {
            extensions: self.extensions,
            diagnostics: self.diagnostics,
        }
    }

    pub(crate) fn into_tool_availability_response(
        self,
        developer_environment: &DeveloperEnvironment,
        cwd: &Path,
    ) -> Vec<ToolAvailabilityResponse> {
        self.tiles
            .into_iter()
            .map(|tile| tool_availability_for_tile(developer_environment, cwd, &tile))
            .collect()
    }
}

#[derive(Debug, Clone)]
pub(crate) struct TerminalLaunchPlan {
    pub(crate) shell_command: Option<String>,
    pub(crate) assigned_resume: Option<TileResumeMetadata>,
}

fn integration_catalog() -> IntegrationCatalog {
    serde_json::from_str(INTEGRATION_CATALOG_JSON)
        .expect("integration catalog should be valid JSON")
}

pub(crate) fn extension_catalog_for_workspace(
    workspace_state: &WorkspaceState,
    workspace_id: Option<&str>,
) -> ExtensionCatalogSnapshot {
    let core_tiles = core_tool_integration_tiles();
    let mut snapshot = ExtensionCatalogSnapshot {
        tiles: core_tiles.clone(),
        diagnostics: Vec::new(),
        extensions: vec![core_extension_settings_entry(&core_tiles)],
    };

    let global_root = workspace_state.app_data_dir.join("extensions");
    load_extension_directory(&global_root, "global", None, None, &mut snapshot);

    if let Some((project_id, project_root)) =
        project_scope_for_workspace(workspace_state, workspace_id)
    {
        let project_root_path = PathBuf::from(&project_root)
            .join(".fluidity")
            .join("extensions");
        load_extension_directory(
            &project_root_path,
            "project",
            Some(project_id),
            Some(project_root),
            &mut snapshot,
        );
    }

    snapshot
}

fn project_scope_for_workspace(
    workspace_state: &WorkspaceState,
    workspace_id: Option<&str>,
) -> Option<(String, String)> {
    let workspace_id = workspace_id?;
    let app_state = workspace_state.app_state.lock().ok()?;
    let workspace = app_state
        .open_workspaces
        .iter()
        .find(|workspace| workspace.id == workspace_id)?;
    let project = app_state
        .projects
        .iter()
        .find(|project| project.id == workspace.project_id)?;
    Some((project.id.clone(), project.root.clone()))
}

pub(crate) fn core_tool_integration_tiles() -> Vec<ToolIntegrationTile> {
    let provenance = ExtensionContributionProvenance {
        source_kind: "core".to_string(),
        extension_id: CORE_EXTENSION_ID.to_string(),
        manifest_path: None,
        project_id: None,
        project_root: None,
    };

    integration_catalog()
        .integrations
        .into_iter()
        .flat_map(|integration| {
            let integration_title = integration.title.clone();
            integration
                .tiles
                .into_iter()
                .map(move |tile| (integration.id.clone(), integration_title.clone(), tile))
        })
        .filter_map(|(integration_id, integration_title, tile)| {
            if tile.kind == "tool" {
                tool_integration_tile_from_core_catalog(
                    integration_id,
                    integration_title,
                    tile,
                    provenance.clone(),
                )
            } else {
                None
            }
        })
        .collect()
}

fn core_extension_settings_entry(tiles: &[ToolIntegrationTile]) -> ExtensionSettingsEntry {
    ExtensionSettingsEntry {
        source_kind: "core".to_string(),
        extension_id: CORE_EXTENSION_ID.to_string(),
        title: "Core Extension Pack".to_string(),
        status: "loaded".to_string(),
        manifest_path: None,
        project_id: None,
        project_root: None,
        diagnostics: Vec::new(),
        tiles: tiles
            .iter()
            .map(extension_settings_tile_from_tool_tile)
            .collect(),
    }
}

pub(crate) fn tool_integration_tile(
    workspace_state: &WorkspaceState,
    workspace_id: Option<&str>,
    extension_id: &str,
    integration_id: &str,
    integration_tile_id: &str,
) -> Option<ToolIntegrationTile> {
    extension_catalog_for_workspace(workspace_state, workspace_id)
        .tiles
        .into_iter()
        .find(|tile| {
            tile.extension_id == extension_id
                && tile.integration_id == integration_id
                && tile.integration_tile_id == integration_tile_id
        })
}

pub(crate) fn tool_integration_tile_for_tile(tile: &PersistedTile) -> Option<ToolIntegrationTile> {
    let extension_id = tile.extension_id.as_deref().unwrap_or(CORE_EXTENSION_ID);
    core_tool_integration_tiles().into_iter().find(|candidate| {
        candidate.extension_id == extension_id
            && candidate.integration_id == tile.integration_id.as_deref().unwrap_or_default()
            && candidate.integration_tile_id
                == tile.integration_tile_id.as_deref().unwrap_or_default()
    })
}

pub(crate) fn legacy_tool_integration_tile(
    legacy_tool_id: Option<&str>,
    legacy_initial_command: Option<&str>,
) -> Option<ToolIntegrationTile> {
    let legacy_id = legacy_tool_id.or(legacy_initial_command)?;
    core_tool_integration_tiles()
        .into_iter()
        .find(|tile| {
            tile.command_argv.first().is_some_and(|command| command == legacy_id)
                || matches!(&tile.resume, ToolResumeStrategy::CoreProvider { provider } if provider == legacy_id)
        })
}

fn tool_integration_tile_from_core_catalog(
    integration_id: String,
    _integration_title: String,
    tile: IntegrationCatalogTile,
    provenance: ExtensionContributionProvenance,
) -> Option<ToolIntegrationTile> {
    let tool_command = tile.tool_command?;
    let resume_provider = tile.resume_provider.unwrap_or_else(|| tool_command.clone());
    Some(ToolIntegrationTile {
        extension_id: CORE_EXTENSION_ID.to_string(),
        integration_id,
        integration_tile_id: tile.id,
        title: tile.title,
        default_visible: tile.default_visible,
        icon: tile.icon_key.map(|key| ExtensionIcon::Key { key }),
        command_argv: vec![tool_command],
        resume: ToolResumeStrategy::CoreProvider {
            provider: resume_provider,
        },
        provenance,
    })
}

fn load_extension_directory(
    root: &Path,
    source_kind: &str,
    project_id: Option<String>,
    project_root: Option<String>,
    snapshot: &mut ExtensionCatalogSnapshot,
) {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(error) => {
            snapshot.diagnostics.push(extension_diagnostic(
                "error",
                format!(
                    "Could not read Extension directory {}: {}",
                    root.display(),
                    error
                ),
                source_kind,
                "unknown",
                Some(root.to_string_lossy().to_string()),
                project_id,
                project_root,
            ));
            return;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let extension_dir_name = entry.file_name().to_string_lossy().to_string();
        let manifest_path = path.join(EXTENSION_DEFINITION_FILE);
        if !manifest_path.is_file() {
            continue;
        }
        load_extension_definition(
            &manifest_path,
            &extension_dir_name,
            source_kind,
            project_id.clone(),
            project_root.clone(),
            snapshot,
        );
    }
}

fn extension_provenance(
    source_kind: &str,
    extension_id: &str,
    manifest_path: Option<String>,
    project_id: Option<String>,
    project_root: Option<String>,
) -> ExtensionContributionProvenance {
    ExtensionContributionProvenance {
        source_kind: source_kind.to_string(),
        extension_id: extension_id.to_string(),
        manifest_path,
        project_id,
        project_root,
    }
}

fn extension_settings_entry(
    provenance: ExtensionContributionProvenance,
    title: &str,
    status: &str,
    diagnostics: Vec<ExtensionDiagnostic>,
    tiles: Vec<ExtensionSettingsTile>,
) -> ExtensionSettingsEntry {
    let title = if title.trim().is_empty() {
        provenance.extension_id.clone()
    } else {
        title.to_string()
    };

    ExtensionSettingsEntry {
        source_kind: provenance.source_kind,
        extension_id: provenance.extension_id,
        title,
        status: status.to_string(),
        manifest_path: provenance.manifest_path,
        project_id: provenance.project_id,
        project_root: provenance.project_root,
        diagnostics,
        tiles,
    }
}

fn load_extension_definition(
    manifest_path: &Path,
    extension_dir_name: &str,
    source_kind: &str,
    project_id: Option<String>,
    project_root: Option<String>,
    snapshot: &mut ExtensionCatalogSnapshot,
) {
    let manifest_path_string = manifest_path.to_string_lossy().to_string();
    let bytes = match fs::read(manifest_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            let diagnostic = extension_diagnostic(
                "error",
                format!(
                    "Could not read Extension Definition {}: {}",
                    manifest_path.display(),
                    error
                ),
                source_kind,
                extension_dir_name,
                Some(manifest_path_string.clone()),
                project_id.clone(),
                project_root.clone(),
            );
            snapshot.diagnostics.push(diagnostic.clone());
            snapshot.extensions.push(extension_settings_entry(
                extension_provenance(
                    source_kind,
                    extension_dir_name,
                    Some(manifest_path_string),
                    project_id,
                    project_root,
                ),
                extension_dir_name,
                "invalid",
                vec![diagnostic],
                Vec::new(),
            ));
            return;
        }
    };

    let definition = match serde_json::from_slice::<ExtensionDefinition>(&bytes) {
        Ok(definition) => definition,
        Err(error) => {
            let diagnostic = extension_diagnostic(
                "error",
                format!(
                    "Invalid Extension Definition {}: {}",
                    manifest_path.display(),
                    error
                ),
                source_kind,
                extension_dir_name,
                Some(manifest_path_string.clone()),
                project_id.clone(),
                project_root.clone(),
            );
            snapshot.diagnostics.push(diagnostic.clone());
            snapshot.extensions.push(extension_settings_entry(
                extension_provenance(
                    source_kind,
                    extension_dir_name,
                    Some(manifest_path_string),
                    project_id,
                    project_root,
                ),
                extension_dir_name,
                "invalid",
                vec![diagnostic],
                Vec::new(),
            ));
            return;
        }
    };

    if let Err(message) = validate_extension_definition(&definition, extension_dir_name) {
        let diagnostic = extension_diagnostic(
            "error",
            format!(
                "Invalid Extension Definition {}: {}",
                manifest_path.display(),
                message
            ),
            source_kind,
            &definition.id,
            Some(manifest_path_string.clone()),
            project_id.clone(),
            project_root.clone(),
        );
        snapshot.diagnostics.push(diagnostic.clone());
        snapshot.extensions.push(extension_settings_entry(
            extension_provenance(
                source_kind,
                &definition.id,
                Some(manifest_path_string),
                project_id,
                project_root,
            ),
            &definition.title,
            "invalid",
            vec![diagnostic],
            Vec::new(),
        ));
        return;
    }

    if snapshot
        .tiles
        .iter()
        .any(|tile| tile.extension_id == definition.id)
    {
        let diagnostic = extension_diagnostic(
            "error",
            format!(
                "Extension `{}` is already loaded in this scope; skipping duplicate",
                definition.id
            ),
            source_kind,
            &definition.id,
            Some(manifest_path_string.clone()),
            project_id.clone(),
            project_root.clone(),
        );
        snapshot.diagnostics.push(diagnostic.clone());
        snapshot.extensions.push(extension_settings_entry(
            extension_provenance(
                source_kind,
                &definition.id,
                Some(manifest_path_string),
                project_id,
                project_root,
            ),
            &definition.title,
            "skipped",
            vec![diagnostic],
            Vec::new(),
        ));
        return;
    }

    let provenance = ExtensionContributionProvenance {
        source_kind: source_kind.to_string(),
        extension_id: definition.id.clone(),
        manifest_path: Some(manifest_path_string.clone()),
        project_id,
        project_root,
    };
    let mut extension_diagnostics = Vec::new();
    let mut extension_tiles = Vec::new();

    for integration in definition.contributes.integrations {
        for tile in integration.tiles {
            let duplicate = snapshot.tiles.iter().any(|existing| {
                existing.extension_id == definition.id
                    && existing.integration_id == integration.id
                    && existing.integration_tile_id == tile.id
            });
            if duplicate {
                let diagnostic = extension_diagnostic(
                    "error",
                    format!(
                        "Duplicate Integration Tile Contribution `{}:{}.{}`; skipping duplicate",
                        definition.id, integration.id, tile.id
                    ),
                    source_kind,
                    &definition.id,
                    Some(manifest_path_string.clone()),
                    provenance.project_id.clone(),
                    provenance.project_root.clone(),
                );
                snapshot.diagnostics.push(diagnostic.clone());
                extension_diagnostics.push(diagnostic);
                continue;
            }

            let resume = match tile.resume.unwrap_or(ExtensionResume::None) {
                ExtensionResume::None => ToolResumeStrategy::None,
                ExtensionResume::SessionIdArg { arg } => ToolResumeStrategy::SessionIdArg {
                    provider: extension_resume_provider(&definition.id, &integration.id, &tile.id),
                    arg,
                },
            };
            let icon = tile
                .icon
                .or_else(|| integration.icon.clone())
                .or_else(|| definition.icon.clone());
            let tool_tile = ToolIntegrationTile {
                extension_id: definition.id.clone(),
                integration_id: integration.id.clone(),
                integration_tile_id: tile.id,
                title: tile.title,
                default_visible: tile.default_visible,
                icon,
                command_argv: tile.command.argv,
                resume,
                provenance: provenance.clone(),
            };
            extension_tiles.push(extension_settings_tile_from_tool_tile(&tool_tile));
            snapshot.tiles.push(tool_tile);
        }
    }

    snapshot.extensions.push(extension_settings_entry(
        provenance,
        &definition.title,
        "loaded",
        extension_diagnostics,
        extension_tiles,
    ));
}

fn validate_extension_definition(
    definition: &ExtensionDefinition,
    extension_dir_name: &str,
) -> Result<(), String> {
    if definition.schema_version != 1 {
        return Err("schemaVersion must be 1".to_string());
    }
    if definition.id == CORE_EXTENSION_ID {
        return Err(format!(
            "{} is reserved for the Core Extension Pack",
            CORE_EXTENSION_ID
        ));
    }
    if definition.id != extension_dir_name {
        return Err(format!(
            "Extension directory `{}` must match Extension id `{}`",
            extension_dir_name, definition.id
        ));
    }
    if !is_valid_extension_id(&definition.id) {
        return Err(format!("invalid Extension id `{}`", definition.id));
    }
    if definition.title.trim().is_empty() {
        return Err("Extension title must not be empty".to_string());
    }
    if definition.contributes.integrations.is_empty() {
        return Err("contributes.integrations must not be empty".to_string());
    }

    for integration in &definition.contributes.integrations {
        if !is_valid_contribution_id(&integration.id) {
            return Err(format!("invalid Integration id `{}`", integration.id));
        }
        if integration.title.trim().is_empty() {
            return Err(format!(
                "Integration `{}` title must not be empty",
                integration.id
            ));
        }
        if integration.tiles.is_empty() {
            return Err(format!(
                "Integration `{}` must include at least one Tile",
                integration.id
            ));
        }
        for tile in &integration.tiles {
            if !is_valid_contribution_id(&tile.id) {
                return Err(format!("invalid Integration Tile id `{}`", tile.id));
            }
            if tile.kind != "tool" {
                return Err(format!(
                    "Integration Tile `{}` kind must be `tool`",
                    tile.id
                ));
            }
            if tile.title.trim().is_empty() {
                return Err(format!(
                    "Integration Tile `{}` title must not be empty",
                    tile.id
                ));
            }
            if tile.command.argv.is_empty() {
                return Err(format!(
                    "Integration Tile `{}` command.argv must not be empty",
                    tile.id
                ));
            }
            for arg in &tile.command.argv {
                if arg.is_empty() || arg.contains('\0') || arg.contains('\n') || arg.contains('\r')
                {
                    return Err(format!(
                        "Integration Tile `{}` command.argv contains an invalid argv entry",
                        tile.id
                    ));
                }
            }
        }
    }

    Ok(())
}

fn extension_settings_tile_from_tool_tile(tile: &ToolIntegrationTile) -> ExtensionSettingsTile {
    ExtensionSettingsTile {
        integration_id: tile.integration_id.clone(),
        integration_tile_id: tile.integration_tile_id.clone(),
        title: tile.title.clone(),
        default_visible: tile.default_visible,
    }
}

fn integration_catalog_tile_response(tile: ToolIntegrationTile) -> IntegrationCatalogTileResponse {
    IntegrationCatalogTileResponse {
        extension_id: tile.extension_id,
        integration_id: tile.integration_id,
        integration_tile_id: tile.integration_tile_id,
        title: tile.title.clone(),
        default_visible: tile.default_visible,
        icon: Some(extension_icon_response(tile.icon, &tile.title)),
        provenance: tile.provenance,
    }
}

fn extension_icon_response(
    icon: Option<ExtensionIcon>,
    fallback_title: &str,
) -> ExtensionIconResponse {
    let fallback_text = fallback_icon_text(fallback_title);
    match icon {
        Some(ExtensionIcon::Key { key }) if is_first_party_icon_key(&key) => {
            ExtensionIconResponse::Key { key, fallback_text }
        }
        Some(ExtensionIcon::Path { path }) => ExtensionIconResponse::Path {
            path,
            fallback_text,
        },
        _ => ExtensionIconResponse::Text { fallback_text },
    }
}

fn fallback_icon_text(title: &str) -> String {
    title
        .split_whitespace()
        .filter_map(|word| word.chars().next())
        .take(2)
        .collect::<String>()
        .to_uppercase()
}

pub(crate) fn tool_availability_for_tile(
    developer_environment: &DeveloperEnvironment,
    cwd: &Path,
    tile: &ToolIntegrationTile,
) -> ToolAvailabilityResponse {
    let command = tile.command_argv.first().cloned().unwrap_or_default();
    let check_command = format!("command -v {}", shell_escape_arg(&command));
    match Command::new(&developer_environment.shell)
        .arg("-lc")
        .arg(check_command)
        .current_dir(cwd)
        .envs(developer_environment.variables.iter())
        .output()
    {
        Ok(output) => {
            let resolved_path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(str::to_string);

            if output.status.success() && resolved_path.is_some() {
                ToolAvailabilityResponse {
                    extension_id: tile.extension_id.clone(),
                    integration_id: tile.integration_id.clone(),
                    integration_tile_id: tile.integration_tile_id.clone(),
                    title: tile.title.clone(),
                    command,
                    status: ToolAvailabilityStatus::Available,
                    resolved_path,
                    detail: None,
                    provenance: tile.provenance.clone(),
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                ToolAvailabilityResponse {
                    extension_id: tile.extension_id.clone(),
                    integration_id: tile.integration_id.clone(),
                    integration_tile_id: tile.integration_tile_id.clone(),
                    title: tile.title.clone(),
                    command,
                    status: ToolAvailabilityStatus::Unavailable,
                    resolved_path: None,
                    detail: if stderr.is_empty() {
                        None
                    } else {
                        Some(stderr)
                    },
                    provenance: tile.provenance.clone(),
                }
            }
        }
        Err(error) => ToolAvailabilityResponse {
            extension_id: tile.extension_id.clone(),
            integration_id: tile.integration_id.clone(),
            integration_tile_id: tile.integration_tile_id.clone(),
            title: tile.title.clone(),
            command,
            status: ToolAvailabilityStatus::Unknown,
            resolved_path: None,
            detail: Some(error.to_string()),
            provenance: tile.provenance.clone(),
        },
    }
}

pub(crate) fn ensure_tool_available(
    developer_environment: &DeveloperEnvironment,
    cwd: &Path,
    tile: &ToolIntegrationTile,
) -> Result<(), String> {
    let availability = tool_availability_for_tile(developer_environment, cwd, tile);
    let command = tile.command_argv.first().cloned().unwrap_or_default();
    match availability.status {
        ToolAvailabilityStatus::Available => Ok(()),
        ToolAvailabilityStatus::Unavailable => Err(format!(
            "{} CLI is not installed or is not on Fluidity's PATH. Install `{}` and try again.",
            tile.title, command
        )),
        ToolAvailabilityStatus::Unknown => Err(format!(
            "Fluidity could not verify whether the {} CLI is installed. {}",
            tile.title,
            availability.detail.unwrap_or_else(|| {
                "Check your shell and PATH settings, then try again.".to_string()
            })
        )),
    }
}

fn extension_diagnostic(
    severity: &str,
    message: String,
    source_kind: &str,
    extension_id: &str,
    manifest_path: Option<String>,
    project_id: Option<String>,
    project_root: Option<String>,
) -> ExtensionDiagnostic {
    ExtensionDiagnostic {
        severity: severity.to_string(),
        message,
        source_kind: source_kind.to_string(),
        extension_id: extension_id.to_string(),
        manifest_path,
        project_id,
        project_root,
    }
}

fn extension_resume_provider(extension_id: &str, integration_id: &str, tile_id: &str) -> String {
    format!("{}.{}.{}", extension_id, integration_id, tile_id)
}

fn is_first_party_icon_key(key: &str) -> bool {
    matches!(key, "claude" | "codex" | "gemini" | "opencode" | "pi")
}

pub(crate) fn is_valid_extension_id(id: &str) -> bool {
    is_valid_segmented_id(id, 3, 128, b".-")
}

pub(crate) fn is_valid_contribution_id(id: &str) -> bool {
    is_valid_segmented_id(id, 1, 64, b"._-")
}

fn is_valid_segmented_id(id: &str, min_len: usize, max_len: usize, separators: &[u8]) -> bool {
    if id.len() < min_len || id.len() > max_len {
        return false;
    }

    let bytes = id.as_bytes();
    if !bytes[0].is_ascii_lowercase() {
        return false;
    }
    let mut previous_was_separator = false;
    for byte in bytes {
        let separator = separators.contains(byte);
        if separator && previous_was_separator {
            return false;
        }
        if !(byte.is_ascii_lowercase() || byte.is_ascii_digit() || separator) {
            return false;
        }
        previous_was_separator = separator;
    }

    !previous_was_separator
}

#[cfg(test)]
pub(crate) fn terminal_launch_plan(
    launch: &TerminalLaunchRequest,
) -> Result<TerminalLaunchPlan, String> {
    let tool_tile = tool_integration_tile_for_launch_without_project_scope(launch)?;
    terminal_launch_plan_for_resolved_tool(launch, tool_tile.as_ref())
}

#[cfg(test)]
pub(crate) fn tool_integration_tile_for_launch_without_project_scope(
    launch: &TerminalLaunchRequest,
) -> Result<Option<ToolIntegrationTile>, String> {
    if launch.kind != "tool" {
        return Ok(None);
    }

    let extension_id = launch.extension_id.as_deref().unwrap_or(CORE_EXTENSION_ID);
    if let Some((integration_id, integration_tile_id)) = launch
        .integration_id
        .as_deref()
        .zip(launch.integration_tile_id.as_deref())
    {
        if let Some(tile) = core_tool_integration_tiles().into_iter().find(|tile| {
            tile.extension_id == extension_id
                && tile.integration_id == integration_id
                && tile.integration_tile_id == integration_tile_id
        }) {
            return Ok(Some(tile));
        }
        if let Some(tile) = legacy_tool_integration_tile(launch.tool_id.as_deref(), None) {
            return Ok(Some(tile));
        }
        return Err(unresolved_integration_tile_error(
            extension_id,
            integration_id,
            integration_tile_id,
        ));
    }

    legacy_tool_integration_tile(launch.tool_id.as_deref(), None)
        .map(Some)
        .ok_or_else(|| "unsupported integration tile".to_string())
}

pub(crate) fn tool_integration_tile_for_launch(
    workspace_state: &WorkspaceState,
    workspace_id: &str,
    launch: &TerminalLaunchRequest,
) -> Result<Option<ToolIntegrationTile>, String> {
    if launch.kind != "tool" {
        return Ok(None);
    }

    let extension_id = launch.extension_id.as_deref().unwrap_or(CORE_EXTENSION_ID);
    if let Some((integration_id, integration_tile_id)) = launch
        .integration_id
        .as_deref()
        .zip(launch.integration_tile_id.as_deref())
    {
        if let Some(tile) = tool_integration_tile(
            workspace_state,
            Some(workspace_id),
            extension_id,
            integration_id,
            integration_tile_id,
        ) {
            return Ok(Some(tile));
        }
        if let Some(tile) = legacy_tool_integration_tile(launch.tool_id.as_deref(), None) {
            return Ok(Some(tile));
        }
        return Err(unresolved_integration_tile_error(
            extension_id,
            integration_id,
            integration_tile_id,
        ));
    }

    legacy_tool_integration_tile(launch.tool_id.as_deref(), None)
        .map(Some)
        .ok_or_else(|| "unsupported integration tile".to_string())
}

pub(crate) fn unresolved_integration_tile_error(
    extension_id: &str,
    integration_id: &str,
    integration_tile_id: &str,
) -> String {
    format!(
        "Integration Tile unavailable. Fluidity could not find `{}:{}.{}` for this Workspace. Restore the Extension Definition or run Reload Extensions after fixing it.",
        extension_id, integration_id, integration_tile_id
    )
}

pub(crate) fn terminal_launch_plan_for_resolved_tool(
    launch: &TerminalLaunchRequest,
    tool_tile: Option<&ToolIntegrationTile>,
) -> Result<TerminalLaunchPlan, String> {
    let Some(tool_tile) = tool_tile else {
        return Ok(TerminalLaunchPlan {
            shell_command: None,
            assigned_resume: None,
        });
    };

    let existing_resume = launch
        .resume
        .clone()
        .and_then(|resume| sanitize_resume_metadata(Some(resume)));

    match &tool_tile.resume {
        ToolResumeStrategy::CoreProvider { provider } => {
            if let Some(resume) = existing_resume.filter(|resume| resume.provider == *provider) {
                return Ok(TerminalLaunchPlan {
                    shell_command: Some(resume_tool_shell_command(provider, &resume)),
                    assigned_resume: None,
                });
            }

            if launch.resume.is_none() {
                if let Some(resume) = new_preassigned_resume(provider) {
                    return Ok(TerminalLaunchPlan {
                        shell_command: Some(new_tool_shell_command(provider, &resume)),
                        assigned_resume: Some(resume),
                    });
                }
            }
        }
        ToolResumeStrategy::None => {}
        ToolResumeStrategy::SessionIdArg { provider, arg } => {
            if let Some(resume) = existing_resume.filter(|resume| resume.provider == *provider) {
                let mut args = tool_tile.command_argv.clone();
                args.push(arg.clone());
                args.push(resume.identifier);
                return Ok(TerminalLaunchPlan {
                    shell_command: Some(shell_command_from_args(args)),
                    assigned_resume: None,
                });
            }

            if launch.resume.is_none() {
                let resume = TileResumeMetadata {
                    provider: provider.clone(),
                    identifier: Uuid::new_v4().to_string(),
                };
                let mut args = tool_tile.command_argv.clone();
                args.push(arg.clone());
                args.push(resume.identifier.clone());
                return Ok(TerminalLaunchPlan {
                    shell_command: Some(shell_command_from_args(args)),
                    assigned_resume: Some(resume),
                });
            }
        }
    }

    Ok(TerminalLaunchPlan {
        shell_command: Some(shell_command_from_args(tool_tile.command_argv.clone())),
        assigned_resume: None,
    })
}

fn new_preassigned_resume(tool_id: &str) -> Option<TileResumeMetadata> {
    if !matches!(tool_id, "claude" | "gemini" | "pi") {
        return None;
    }

    Some(TileResumeMetadata {
        provider: tool_id.to_string(),
        identifier: Uuid::new_v4().to_string(),
    })
}

fn new_tool_shell_command(tool_id: &str, resume: &TileResumeMetadata) -> String {
    let mut args = vec![tool_id.to_string()];

    match tool_id {
        "claude" | "gemini" | "pi" => {
            args.push("--session-id".to_string());
            args.push(resume.identifier.clone());
        }
        _ => {}
    }

    shell_command_from_args(args)
}

fn resume_tool_shell_command(tool_id: &str, resume: &TileResumeMetadata) -> String {
    let mut args = vec![tool_id.to_string()];

    match tool_id {
        "claude" | "gemini" => {
            args.push("--resume".to_string());
            args.push(resume.identifier.clone());
        }
        "codex" => {
            args.push("resume".to_string());
            args.push(resume.identifier.clone());
        }
        "opencode" | "pi" => {
            args.push("--session".to_string());
            args.push(resume.identifier.clone());
        }
        _ => {}
    }

    shell_command_from_args(args)
}

fn shell_command_from_args(args: Vec<String>) -> String {
    args.iter()
        .map(|arg| shell_escape_arg(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_escape_arg(arg: &str) -> String {
    format!("'{}'", arg.replace('\'', "'\\''"))
}

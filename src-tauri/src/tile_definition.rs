use super::{
    extension_catalog::{is_valid_contribution_id, is_valid_extension_id},
    PersistedTile, TileResumeMetadata,
};

pub(crate) fn is_builtin_tile_kind(kind: &str) -> bool {
    matches!(kind, "terminal" | "workspace" | "code" | "diff" | "notepad")
}

pub(crate) fn fallback_title_for_builtin_tile(kind: &str) -> Option<&'static str> {
    match kind {
        "terminal" => Some("Terminal"),
        "workspace" => Some("Workspaces"),
        "code" => Some("Code Editor"),
        "diff" => Some("Diff"),
        "notepad" => Some("Notepad"),
        _ => None,
    }
}

pub(crate) fn clear_integration_identity(tile: &mut PersistedTile) {
    tile.extension_id = None;
    tile.integration_id = None;
    tile.integration_tile_id = None;
    tile.resume = None;
}

pub(crate) fn is_valid_persisted_tool_tile_identity(tile: &PersistedTile) -> bool {
    tile.extension_id
        .as_deref()
        .is_some_and(is_valid_extension_id)
        && tile
            .integration_id
            .as_deref()
            .is_some_and(is_valid_contribution_id)
        && tile
            .integration_tile_id
            .as_deref()
            .is_some_and(is_valid_contribution_id)
}

pub(crate) fn sanitize_resume_metadata(
    resume: Option<TileResumeMetadata>,
) -> Option<TileResumeMetadata> {
    let resume = resume?;
    if !is_valid_resume_provider(&resume.provider) {
        return None;
    }
    if !is_valid_resume_identifier(&resume.identifier) {
        return None;
    }
    Some(resume)
}

fn is_valid_resume_provider(provider: &str) -> bool {
    !provider.is_empty()
        && provider.len() <= 256
        && provider.bytes().all(|byte| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_digit()
                || byte == b'-'
                || byte == b'_'
                || byte == b'.'
        })
}

pub(crate) fn is_valid_resume_identifier(identifier: &str) -> bool {
    !identifier.is_empty()
        && identifier.len() <= 512
        && !identifier.contains('\0')
        && !identifier.contains('\n')
        && !identifier.contains('\r')
}

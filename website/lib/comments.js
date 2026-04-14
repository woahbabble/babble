export function buildCommentTree(comments) {
  const byId = new Map()
  const roots = []

  for (const comment of comments) {
    byId.set(comment.id, { ...comment, children: [] })
  }

  for (const comment of byId.values()) {
    if (!comment.parent_id) {
      roots.push(comment)
      continue
    }

    const parent = byId.get(comment.parent_id)
    if (!parent) {
      roots.push(comment)
      continue
    }
    parent.children.push(comment)
  }

  return roots
}

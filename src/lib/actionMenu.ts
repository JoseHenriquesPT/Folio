export interface ActionMenuItem<Id extends string = string> {
  id: Id;
  label: string;
  tone?: "danger";
}

export interface ActionAnchor {
  x: number;
  y: number;
}

/** Everything needed to show one action menu at one point on screen. */
export interface ActionMenuRequest<Id extends string = string> {
  /** What the menu acts on; the accessible name reads "Actions for …". */
  label: string;
  anchor: ActionAnchor;
  items: ActionMenuItem<Id>[];
}

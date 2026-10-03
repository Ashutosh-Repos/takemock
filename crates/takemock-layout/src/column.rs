use crate::tsv::{TsvBlock, TsvLine};

pub struct ColumnProcessor;

impl ColumnProcessor {
    /// Orders blocks in natural reading order (top to bottom).
    pub fn order_blocks_in_reading_order(mut blocks: Vec<TsvBlock>, _page_width: u32) -> Vec<TsvBlock> {
        blocks.sort_by_key(|b| b.rect.y);
        blocks
    }

    /// Orders lines strictly in natural reading order (top-to-bottom, left-to-right).
    pub fn order_lines_in_reading_order(mut lines: Vec<TsvLine>) -> Vec<TsvLine> {
        lines.sort_by_key(|l| (l.rect.y, l.rect.x));
        lines
    }
}

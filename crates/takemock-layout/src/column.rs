use crate::tsv::TsvBlock;

pub struct ColumnProcessor;

impl ColumnProcessor {
    /// Orders blocks naturally: header -> column 1 (top to bottom) -> column 2 (top to bottom).
    pub fn order_blocks_in_reading_order(mut blocks: Vec<TsvBlock>, page_width: u32) -> Vec<TsvBlock> {
        if blocks.is_empty() {
            return blocks;
        }

        let mid_x = page_width / 2;
        let column_margin = (page_width as f32 * 0.12) as u32;

        let mut header_blocks = Vec::new();
        let mut left_blocks = Vec::new();
        let mut right_blocks = Vec::new();

        for b in blocks.drain(..) {
            let center_x = b.rect.x + b.rect.width / 2;
            let spans_both = b.rect.width > (page_width as f32 * 0.70) as u32;

            if spans_both && b.rect.y < (page_width as f32 * 0.25) as u32 {
                header_blocks.push(b);
            } else if center_x < mid_x + column_margin / 2 {
                left_blocks.push(b);
            } else {
                right_blocks.push(b);
            }
        }

        // Sort each partition top-to-bottom
        header_blocks.sort_by_key(|b| b.rect.y);
        left_blocks.sort_by_key(|b| b.rect.y);
        right_blocks.sort_by_key(|b| b.rect.y);

        let mut ordered = Vec::new();
        ordered.extend(header_blocks);
        ordered.extend(left_blocks);
        ordered.extend(right_blocks);
        ordered
    }
}

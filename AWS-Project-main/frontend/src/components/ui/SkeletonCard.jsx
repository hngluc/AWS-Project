

/**
 * SkeletonCard – shimmer placeholder for image cards during loading state.
 * Renders a grid of skeleton cards that mimic the image card layout.
 *
 * @param {number} count - Number of skeleton cards to render (default 8)
 */
export const SkeletonCard = ({ count = 8 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`skeleton-${i}`}
          className="skeleton-card stagger-item"
          style={{ animationDelay: `${i * 60}ms` }}
          aria-hidden="true"
        >
          <div className="skeleton-image" />
          <div className="skeleton-footer">
            <div className="skeleton-line long" />
            <div className="skeleton-line short" />
          </div>
        </div>
      ))}
    </>
  );
};

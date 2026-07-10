"use client";

export type AirdropCreateStepId = "campaign" | "reward" | "rules" | "review";

export const AIRDROP_CREATE_STEPS: {
  id: AirdropCreateStepId;
  label: string;
  title: string;
}[] = [
  {
    id: "campaign",
    label: "Basics",
    title: "Set up your campaign",
  },
  {
    id: "reward",
    label: "Pool",
    title: "Fund the reward pool",
  },
  {
    id: "rules",
    label: "Qualify",
    title: "Define who qualifies",
  },
  {
    id: "review",
    label: "Launch",
    title: "Review and publish",
  },
];

type AirdropCreateStepNavProps = {
  currentIndex: number;
  maxReachedIndex: number;
  onStepClick?: (index: number) => void;
};

export function AirdropCreateStepIntro({ stepIndex }: { stepIndex: number }) {
  const step = AIRDROP_CREATE_STEPS[stepIndex];
  if (!step) return null;

  return (
    <header className="airdrop-create-step-intro">
      <h2 className="airdrop-create-step-intro__title">{step.title}</h2>
    </header>
  );
}

export function AirdropCreateStepNav({
  currentIndex,
  maxReachedIndex,
  onStepClick,
}: AirdropCreateStepNavProps) {
  return (
    <nav
      className="airdrop-create-flow"
      aria-label="Create campaign progress"
      aria-valuenow={currentIndex + 1}
      aria-valuemin={1}
      aria-valuemax={AIRDROP_CREATE_STEPS.length}
    >
      <ol className="airdrop-create-flow__list">
        {AIRDROP_CREATE_STEPS.map((step, index) => {
          const isActive = index === currentIndex;
          const isDone = index < currentIndex;
          const isReachable = index <= maxReachedIndex;
          const isLast = index === AIRDROP_CREATE_STEPS.length - 1;

          const stepClass = [
            "airdrop-create-flow__step",
            isActive ? "airdrop-create-flow__step--active" : "",
            isDone ? "airdrop-create-flow__step--done" : "",
            !isReachable ? "airdrop-create-flow__step--locked" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const marker = (
            <>
              <span className="airdrop-create-flow__marker-check" aria-hidden>
                {isDone ? "✓" : String(index + 1)}
              </span>
              <span className="airdrop-create-flow__marker-num" aria-hidden>
                {String(index + 1)}
              </span>
            </>
          );

          const stepContent = (
            <>
              <span className="airdrop-create-flow__marker financial-value" aria-hidden>
                {marker}
              </span>
              <span className="airdrop-create-flow__label">{step.label}</span>
            </>
          );

          return (
            <li key={step.id} className="airdrop-create-flow__item">
              {isReachable && onStepClick && !isActive ? (
                <button
                  type="button"
                  className={stepClass}
                  onClick={() => onStepClick(index)}
                  aria-label={`Go to step ${index + 1}: ${step.title}`}
                >
                  {stepContent}
                </button>
              ) : (
                <span
                  className={stepClass}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={isActive ? `Current step: ${step.title}` : step.title}
                >
                  {stepContent}
                </span>
              )}
              {!isLast ? (
                <span
                  className={[
                    "airdrop-create-flow__rail",
                    index < currentIndex ? "airdrop-create-flow__rail--done" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

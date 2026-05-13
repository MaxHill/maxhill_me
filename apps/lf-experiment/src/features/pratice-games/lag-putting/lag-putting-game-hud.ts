import { LagPuttingGame, LagPuttingGameService } from "./lag-putting-service";
import { html } from "lit-html";

export const lagPuttingHud = (game: LagPuttingGame, gameService: LagPuttingGameService) => {
  const completedPutts = game?.putts.filter((p) => p.result !== null).length || 0;
  const totalPutts = 18;
  const outScore = gameService.calculateOutScore(game.putts);
  const inScore = gameService.calculateInScore(game.putts);
  const totalScore = gameService.calculateTotalScore(game.putts);

  return html`
    <dl class="game-hud">
      <dt>Created</dt>
      <dd>${game.createdAt || "-"}</dd>

      <dt>Player</dt>
      <dd>${game?.playerName}</dd>

      <dt>Course</dt>
      <dd>${game?.courseName}</dd>

      <dt>Pratice area</dt>
      <dd>${game?.practiceAreaName}</dd>

      <dt>Progress</dt>
      <dd>${completedPutts}/${totalPutts}</dd>

      <dt>Out Score</dt>
      <dd>${outScore > 0 ? "+" : ""}${outScore}</dd>

      <dt>In Score</dt>
      <dd>${inScore > 0 ? "+" : ""}${inScore}</dd>

      <dt>Total Score</dt>
      <dd>${totalScore > 0 ? "+" : ""}${totalScore}</dd>
    </dl>
  `;
};

import {Gulpclass, SequenceTask} from "gulpclass/Decorators";

@Gulpclass()
class Gulpfile {
    /**
     * Fetches all necessary remote data for visualization
     */
    @SequenceTask("fetch")
    public fetch(): string[] {
        return [];
    }
}

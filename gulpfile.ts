import {Gulpclass, SequenceTask} from "gulpclass/Decorators";
import "./gulp/fetch/index";

@Gulpclass()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Gulpfile {
    @SequenceTask("default")
    public default(): string[] {
        return ["fetch"];
    }
}
